import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor, querySignature } from "./cursor";
import { listQuerySchema } from "./params";

const baseQuery = listQuerySchema.parse({});

describe("cursor", () => {
  const signature = querySignature(baseQuery);

  it("round trips a cursor", () => {
    const encoded = encodeCursor({ sortValue: "2026-09-12", id: "abc", signature });

    expect(decodeCursor(encoded, signature)).toEqual({
      sortValue: "2026-09-12",
      id: "abc",
      signature,
    });
  });

  it("rejects a cursor issued for a different query", () => {
    const encoded = encodeCursor({ sortValue: "2026-09-12", id: "abc", signature });
    const other = querySignature(listQuerySchema.parse({ sort: "provider" }));

    expect(decodeCursor(encoded, other)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(decodeCursor("not-a-cursor", signature)).toBeNull();
  });

  it("ignores status ordering when signing", () => {
    const a = querySignature(listQuerySchema.parse({ status: "active,trial" }));
    const b = querySignature(listQuerySchema.parse({ status: "trial,active" }));

    expect(a).toBe(b);
  });
});
