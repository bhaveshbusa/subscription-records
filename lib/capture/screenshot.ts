import { and, eq, lt, or } from "drizzle-orm";

import { captureRuns, captures } from "@/lib/db/schema";
import { listCaptureProposals } from "@/lib/proposals/query";
import type { ProposalView } from "@/lib/proposals/projection";
import {
  ObjectMissingError,
  storageKey,
  type ObjectStore,
} from "@/lib/storage/objects";

import { extractImageCandidates, type Extraction, type ImageToRead } from "./extract";
import type { FollowUp } from "./follow-up";
import {
  imageExtension,
  isImageMediaType,
  MAX_IMAGE_BYTES,
  type ImageCaptureInput,
} from "./image";
import { recordExtraction, type CaptureClient, type CaptureMatch } from "./record";

export const IMAGE_CAPTURE_SOURCE = "chat_image";

/** The upload the browser is allowed to make, and the row waiting for it. */
export type StartedImageCapture = {
  captureId: string;
  state: "awaiting_upload";
  upload: {
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
};

/**
 * Where a screenshot has got to, and what came out of it. `reading` is the state
 * the chat shows while a model is looking at the image; the proposals only ever
 * arrive with `read`, and they are pending until someone accepts them.
 */
export type ImageCaptureReading = {
  captureId: string;
  state: "awaiting_upload" | "reading" | "read" | "failed";
  error: string | null;
  mode: Extraction["mode"] | null;
  notice: string | null;
  proposals: ProposalView[];
  matches: CaptureMatch[];
  followUp: FollowUp | null;
};

/**
 * How long a reading may be in flight before another request may take it over,
 * so a server that died mid-read leaves a retryable screenshot rather than one
 * stuck on `reading` for good.
 */
export const READING_TAKEOVER_MS = 60_000;

export class CaptureMissingError extends Error {
  constructor(captureId: string) {
    super(`no image capture ${captureId} for this user`);
    this.name = "CaptureMissingError";
  }
}

/**
 * Reserves the key, records the capture and the job that will read it, and signs
 * a write to that one key. The browser never chooses where its bytes land and is
 * never handed anything it could read them back with.
 */
export async function startImageCapture(
  client: CaptureClient,
  options: {
    userId: string;
    input: ImageCaptureInput;
    store: ObjectStore;
  },
): Promise<StartedImageCapture> {
  const key = storageKey({
    userId: options.userId,
    extension: imageExtension(options.input.mediaType),
  });
  const upload = await options.store.presignUpload({
    key,
    mediaType: options.input.mediaType,
  });
  const [capture] = await client
    .insert(captures)
    .values({
      user_id: options.userId,
      kind: "image",
      source: IMAGE_CAPTURE_SOURCE,
      storage_key: key,
      media_type: options.input.mediaType,
      byte_size: options.input.byteSize,
      file_name: options.input.fileName,
    })
    .returning({ id: captures.id });

  await client.insert(captureRuns).values({
    user_id: options.userId,
    capture_id: capture.id,
    state: "awaiting_upload",
  });

  return {
    captureId: capture.id,
    state: "awaiting_upload",
    upload: {
      url: upload.url,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
    },
  };
}

/** A connection that can also open the transaction the proposals are written in. */
export type ImageCaptureDb = CaptureClient & {
  transaction<T>(run: (tx: CaptureClient) => Promise<T>): Promise<T>;
};

type ImageExtractor = (image: ImageToRead) => Promise<Extraction>;

/**
 * Reads the uploaded image and turns it into pending proposals. The job row is
 * claimed first, so a second request while a model is reading reports `reading`
 * rather than paying for the same image twice, and a poll after the fact replays
 * the proposals the reading already made.
 *
 * A failure is recorded on the run and reported: the person who uploaded a
 * screenshot is told it could not be read instead of being shown nothing.
 */
export async function readImageCapture(
  db: ImageCaptureDb,
  options: {
    userId: string;
    captureId: string;
    store: ObjectStore;
    extract?: ImageExtractor;
    now?: Date;
  },
): Promise<ImageCaptureReading> {
  const now = options.now ?? new Date();
  const [row] = await db
    .select({
      runId: captureRuns.id,
      state: captureRuns.state,
      error: captureRuns.error,
      storageKey: captures.storage_key,
      mediaType: captures.media_type,
      fileName: captures.file_name,
    })
    .from(captures)
    .innerJoin(captureRuns, eq(captureRuns.capture_id, captures.id))
    .where(
      and(
        eq(captures.id, options.captureId),
        eq(captures.user_id, options.userId),
        eq(captures.kind, "image"),
      ),
    )
    .limit(1);

  if (!row) {
    throw new CaptureMissingError(options.captureId);
  }

  const base = {
    captureId: options.captureId,
    mode: null,
    notice: null,
    matches: [],
    followUp: null,
  };

  if (row.state === "read" || row.state === "failed") {
    return {
      ...base,
      state: row.state,
      error: row.error,
      proposals: await listCaptureProposals(db, {
        userId: options.userId,
        captureId: options.captureId,
      }),
    };
  }

  const [claimed] = await db
    .update(captureRuns)
    .set({ state: "reading", started_at: now, updated_at: now })
    .where(
      and(
        eq(captureRuns.id, row.runId),
        or(
          eq(captureRuns.state, "awaiting_upload"),
          lt(captureRuns.started_at, new Date(now.getTime() - READING_TAKEOVER_MS)),
        ),
      ),
    )
    .returning({ attempts: captureRuns.attempts });

  /** Another request is already reading this one; it will record the proposals. */
  if (!claimed) {
    return { ...base, state: "reading", error: null, proposals: [] };
  }

  try {
    const image = await loadImage(options.store, row);
    const extraction = await (options.extract ?? extractImageCandidates)(image);
    /** One transaction, so a reading never lands without its proposals. */
    const result = await db.transaction((tx) =>
      recordExtraction(tx, {
        userId: options.userId,
        captureId: options.captureId,
        extraction,
        now,
      }),
    );

    await db
      .update(captureRuns)
      .set({
        state: "read",
        attempts: claimed.attempts + 1,
        error: null,
        finished_at: now,
        updated_at: now,
      })
      .where(eq(captureRuns.id, row.runId));

    return {
      captureId: options.captureId,
      state: "read",
      error: null,
      mode: result.mode,
      notice: result.notice,
      proposals: result.proposals,
      matches: result.matches,
      followUp: result.followUp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "the image could not be read";

    await db
      .update(captureRuns)
      .set({
        state: "failed",
        attempts: claimed.attempts + 1,
        error: message,
        finished_at: now,
        updated_at: now,
      })
      .where(eq(captureRuns.id, row.runId));

    return { ...base, state: "failed", error: message, proposals: [] };
  }
}

/** Server-side bytes only: the image goes to the model, never to the browser. */
async function loadImage(
  store: ObjectStore,
  row: { storageKey: string | null; mediaType: string | null; fileName: string | null },
): Promise<ImageToRead> {
  if (!row.storageKey || !row.mediaType || !isImageMediaType(row.mediaType)) {
    throw new Error("this capture has no stored image to read");
  }

  const object = await store.read(row.storageKey).catch((error: unknown) => {
    if (error instanceof ObjectMissingError) {
      throw new Error("the uploaded image never arrived in storage");
    }

    throw error;
  });

  if (object.bytes.length === 0) {
    throw new Error("the uploaded image is empty");
  }

  if (object.bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`an image must be ${MAX_IMAGE_BYTES} bytes or smaller`);
  }

  return {
    bytes: object.bytes,
    mediaType: row.mediaType,
    fileName: row.fileName ?? "screenshot",
  };
}
