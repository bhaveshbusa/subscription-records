import { createHash } from "node:crypto";

import type { ListQuery } from "./params";

export type Cursor = {
  sortValue: string;
  id: string;
  signature: string;
};

type CursorPayload = {
  v: number;
  s: string;
  i: string;
  k: string;
};

const CURSOR_VERSION = 1;

export function querySignature(query: ListQuery) {
  const shape = {
    q: query.q ?? null,
    status: query.status ? [...query.status].sort() : null,
    renewingWithinDays: query.renewingWithinDays ?? null,
    sort: query.sort,
    order: query.order,
  };

  return createHash("sha256").update(JSON.stringify(shape)).digest("hex").slice(0, 16);
}

export function encodeCursor(cursor: Cursor) {
  const payload: CursorPayload = {
    v: CURSOR_VERSION,
    s: cursor.sortValue,
    i: cursor.id,
    k: cursor.signature,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(value: string, signature: string): Cursor | null {
  let payload: unknown;

  try {
    payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Partial<CursorPayload>;

  if (
    candidate.v !== CURSOR_VERSION ||
    typeof candidate.s !== "string" ||
    typeof candidate.i !== "string" ||
    candidate.k !== signature
  ) {
    return null;
  }

  return { sortValue: candidate.s, id: candidate.i, signature: candidate.k };
}
