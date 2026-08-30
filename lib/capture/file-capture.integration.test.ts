import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  amendments,
  captureRuns,
  captures,
  subscriptions,
  users,
} from "@/lib/db/schema";
import { createSeedData, DEFAULT_SEED_EMAIL, SEED_USER_ID } from "@/lib/db/seed-data";
import {
  READING_TAKEOVER_MS,
  type StartedFileCapture,
} from "@/lib/capture/file-capture";
import { samplePdf } from "@/lib/capture/pdf-sample";
import { localStore } from "@/lib/storage/local";

const state = vi.hoisted(() => ({
  email: null as string | null,
  db: null as unknown,
  storeRoot: null as string | null,
}));

vi.mock("@/auth", () => ({
  auth: async () => (state.email ? { user: { email: state.email } } : null),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => state.db,
  closeDb: async () => {},
}));

/** The disk store, rooted in a temporary directory instead of the repository. */
vi.mock("@/lib/storage", () => ({
  getObjectStore: () => localStore(state.storeRoot ?? undefined),
}));

const { POST: startRoute } = await import("@/app/api/captures/files/route");
const { POST: readRoute } = await import(
  "@/app/api/captures/files/[id]/read/route"
);
const { PUT: uploadRoute } = await import("@/app/api/captures/upload/route");

async function start(body: unknown) {
  const response = await startRoute(
    new Request("http://localhost/api/captures/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  return {
    status: response.status,
    body: (await response.json()) as StartedFileCapture & {
      error?: string;
      issues?: { message: string }[];
    },
  };
}

async function read(id: string) {
  const response = await readRoute(
    new Request(`http://localhost/api/captures/files/${id}/read`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );

  return {
    status: response.status,
    body: (await response.json()) as {
      kind: string;
      state: string;
      error: string | null;
      notice: string | null;
      proposals: { id: string; kind: string; state: string; payload: unknown }[];
      error_message?: string;
    },
  };
}

async function upload(key: string, bytes: Uint8Array, mediaType = "image/png") {
  return uploadRoute(
    new Request(`http://localhost/api/captures/upload?key=${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": mediaType },
      body: bytes.slice().buffer,
    }),
  );
}

/** A PNG header is enough: the development reader never looks at the pixels. */
const SCREENSHOT = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** A WebM header is enough: the transcriber is stood in for here. */
const RECORDING = new Uint8Array([26, 69, 223, 163, 1, 0, 0, 0]);

/** A one-page invoice whose text layer says what it bills for. */
const INVOICE = samplePdf([
  ["Acme Billing - Invoice 4021", "Netflix Standard subscription", "GBP 10.99 monthly"],
]);

function keyOf(upload: StartedFileCapture["upload"]): string {
  return new URL(upload.url, "http://localhost").searchParams.get("key") ?? "";
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

/** No key in a test run, so the labelled development reader does the reading. */
describe.runIf(hasDatabase)("file capture API", () => {
  let client: Client;
  let db: NodePgDatabase<typeof schema>;

  beforeAll(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    state.storeRoot = await mkdtemp(join(tmpdir(), "captures-test-"));
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });

    /** The file shares one connection, so a route transaction reuses it. */
    state.db = new Proxy(db, {
      get(target, property) {
        if (property === "transaction") {
          return (run: (tx: NodePgDatabase<typeof schema>) => unknown) => run(target);
        }

        const value = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const seed = createSeedData(new Date());

    await db.insert(users).values(seed.user);
    await db.insert(subscriptions).values(seed.subscriptions);
    await db.insert(amendments).values(seed.amendments);

    state.email = DEFAULT_SEED_EMAIL;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();

    if (state.storeRoot) {
      await rm(state.storeRoot, { recursive: true, force: true });
    }

    vi.unstubAllEnvs();
  });

  it("signs an upload to a key of its own choosing and records the waiting job", async () => {
    const { status, body } = await start({
      fileName: "linear-receipt.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });
    const [capture] = await db
      .select()
      .from(captures)
      .where(eq(captures.id, body.captureId));
    const [run] = await db
      .select()
      .from(captureRuns)
      .where(eq(captureRuns.capture_id, body.captureId));

    expect(status).toBe(201);
    expect(body.state).toBe("awaiting_upload");
    expect(keyOf(body.upload)).toBe(capture.storage_key);
    expect(capture).toMatchObject({
      kind: "image",
      source: "chat_image",
      content: null,
      media_type: "image/png",
      file_name: "linear-receipt.png",
      user_id: SEED_USER_ID,
    });
    /** The key is this server's, scoped to the user, and not the file's name. */
    expect(capture.storage_key).toMatch(new RegExp(`^captures/${SEED_USER_ID}/`));
    expect(capture.storage_key).not.toContain("linear-receipt");
    expect(run.state).toBe("awaiting_upload");
  });

  it("reads an uploaded screenshot into pending proposals, leaving the ledger alone", async () => {
    const { body: started } = await start({
      fileName: "linear-receipt.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });

    expect((await upload(keyOf(started.upload), SCREENSHOT)).status).toBe(204);

    const { status, body } = await read(started.captureId);
    const [run] = await db
      .select()
      .from(captureRuns)
      .where(eq(captureRuns.capture_id, started.captureId));

    expect(status).toBe(201);
    expect(body.state).toBe("read");
    expect(body.notice).toMatch(/file name was pattern-matched/);
    expect(body.proposals.length).toBeGreaterThan(0);
    expect(body.proposals.every((proposal) => proposal.state === "pending")).toBe(true);
    expect(run).toMatchObject({ state: "read", attempts: 1, error: null });
    /** Nothing was written to the ledger: the cards are all that happened. */
    expect(
      await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.provider_canonical, "linear")),
    ).toHaveLength(0);
  });

  it("replays the same cards on a second read instead of reading twice", async () => {
    const { body: started } = await start({
      fileName: "linear-receipt.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });

    await upload(keyOf(started.upload), SCREENSHOT);

    const first = await read(started.captureId);
    const second = await read(started.captureId);

    expect(second.body.state).toBe("read");
    expect(second.body.proposals.map((proposal) => proposal.id)).toEqual(
      first.body.proposals.map((proposal) => proposal.id),
    );
  });

  it("reports a reading in flight, and takes over one that was abandoned", async () => {
    const { body: started } = await start({
      fileName: "linear-receipt.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });

    await upload(keyOf(started.upload), SCREENSHOT);
    await db
      .update(captureRuns)
      .set({ state: "reading", started_at: new Date() })
      .where(eq(captureRuns.capture_id, started.captureId));

    const inFlight = await read(started.captureId);

    expect(inFlight.body.state).toBe("reading");
    expect(inFlight.body.proposals).toEqual([]);

    await db
      .update(captureRuns)
      .set({
        started_at: new Date(Date.now() - READING_TAKEOVER_MS - 1_000),
      })
      .where(eq(captureRuns.capture_id, started.captureId));

    expect((await read(started.captureId)).body.state).toBe("read");
  });

  it("records a visible failure when the bytes never arrived", async () => {
    const { body: started } = await start({
      fileName: "missing.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });

    const { status, body } = await read(started.captureId);
    const [run] = await db
      .select()
      .from(captureRuns)
      .where(eq(captureRuns.capture_id, started.captureId));

    expect(status).toBe(200);
    expect(body.state).toBe("failed");
    expect(body.error).toMatch(/never arrived/);
    expect(body.proposals).toEqual([]);
    expect(run).toMatchObject({ state: "failed", attempts: 1 });
  });

  it("refuses a file no reader accepts", async () => {
    const { status, body } = await start({
      fileName: "statement.csv",
      mediaType: "text/csv",
      byteSize: 2048,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_body");
  });

  it("turns a selectable-text PDF invoice into pending proposals", async () => {
    const { body: started } = await start({
      fileName: "invoice-4021.pdf",
      mediaType: "application/pdf",
      byteSize: INVOICE.length,
    });

    expect(started.kind).toBe("pdf");
    expect((await upload(keyOf(started.upload), INVOICE, "application/pdf")).status).toBe(204);

    const { status, body } = await read(started.captureId);
    const [capture] = await db
      .select()
      .from(captures)
      .where(eq(captures.id, started.captureId));

    expect(status).toBe(201);
    expect(body.state).toBe("read");
    expect(body.kind).toBe("pdf");
    /** The document's own text was read, not its file name. */
    expect(body.notice).toMatch(/text was pattern-matched/);
    expect(body.proposals.length).toBeGreaterThan(0);
    expect(body.proposals.every((proposal) => proposal.state === "pending")).toBe(true);
    expect(capture).toMatchObject({
      kind: "pdf",
      source: "chat_pdf",
      content: null,
      media_type: "application/pdf",
      file_name: "invoice-4021.pdf",
      user_id: SEED_USER_ID,
    });
    expect(capture.storage_key).toMatch(new RegExp(`^captures/${SEED_USER_ID}/.*\\.pdf$`));
    /** Nothing reached the ledger: the cards are all that happened. */
    expect(
      await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.provider_canonical, "netflix")),
    ).toHaveLength(1);
  });

  it("turns a spoken \"add Notion\" into a pending proposal", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk-test");

    /** The transcriber is the only thing stood in for: the recording is real. */
    const transcribe = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "add Notion" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      const { body: started } = await start({
        fileName: "voice-note.webm",
        mediaType: "audio/webm",
        byteSize: RECORDING.length,
      });

      expect(started.kind).toBe("audio");
      expect((await upload(keyOf(started.upload), RECORDING, "audio/webm")).status).toBe(204);

      const { status, body } = await read(started.captureId);
      const [capture] = await db
        .select()
        .from(captures)
        .where(eq(captures.id, started.captureId));

      expect(status).toBe(201);
      expect(body).toMatchObject({ state: "read", kind: "audio" });
      expect(body.notice).toContain("Heard: “add Notion”");
      expect(body.proposals.length).toBeGreaterThan(0);
      expect(body.proposals.every((proposal) => proposal.state === "pending")).toBe(true);
      expect(capture).toMatchObject({
        kind: "audio",
        source: "chat_voice",
        content: null,
        media_type: "audio/webm",
        file_name: "voice-note.webm",
        user_id: SEED_USER_ID,
      });
      expect(capture.storage_key).toMatch(new RegExp(`^captures/${SEED_USER_ID}/.*\\.webm$`));
      /** The recording's bytes went to the transcriber; no link to it was minted. */
      expect(transcribe.mock.calls[0][0]).toBe(
        "https://api.groq.com/openai/v1/audio/transcriptions",
      );
      expect(JSON.stringify(body)).not.toContain(keyOf(started.upload));
      /** Nothing reached the ledger: the seeded Notion row is untouched. */
      expect(
        await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.provider_canonical, "notion")),
      ).toHaveLength(1);
    } finally {
      transcribe.mockRestore();
      vi.stubEnv("GROQ_API_KEY", "");
    }
  });

  it("will not read another user's capture", async () => {
    const { body: started } = await start({
      fileName: "linear-receipt.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });

    await upload(keyOf(started.upload), SCREENSHOT);

    const [other] = await db
      .insert(users)
      .values({ email: "someone-else@example.test" })
      .returning({ id: users.id });

    await db.update(captures).set({ user_id: other.id }).where(eq(captures.id, started.captureId));
    await db
      .update(captureRuns)
      .set({ user_id: other.id })
      .where(eq(captureRuns.capture_id, started.captureId));

    const { status, body } = await read(started.captureId);

    expect(status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
  });

  it("refuses a development upload aimed at another user's key", async () => {
    const response = await upload(`captures/${crypto.randomUUID()}/a.png`, SCREENSHOT);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_key" });
  });

  it("refuses a development upload of a kind no reader accepts", async () => {
    const { body: started } = await start({
      fileName: "linear-receipt.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });
    const response = await upload(keyOf(started.upload), SCREENSHOT, "text/csv");

    expect(response.status).toBe(415);
  });

  it("hands the browser nothing it could read a stored image back with", async () => {
    const { body: started } = await start({
      fileName: "linear-receipt.png",
      mediaType: "image/png",
      byteSize: SCREENSHOT.length,
    });

    await localStore(state.storeRoot ?? undefined).write(
      keyOf(started.upload),
      SCREENSHOT,
    );

    const { body } = await read(started.captureId);

    expect(JSON.stringify(body)).not.toContain(keyOf(started.upload));
    expect(JSON.stringify(started)).not.toMatch(/GET|X-Amz-SignedHeaders=.*range/i);
  });
});
