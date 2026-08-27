import { describe, expect, it } from "vitest";

import { isSeedLoginEnabled } from "./deployment";
import { verifySeedCredentials } from "./seed-auth";

const seedEnvironment = {
  SEED_EMAIL: "seed@example.com",
  SEED_PASSWORD: "correct-password",
};

describe("seed authentication", () => {
  it("accepts the configured seed credentials", () => {
    expect(
      verifySeedCredentials(
        {
          email: "SEED@example.com",
          password: "correct-password",
        },
        seedEnvironment,
      ),
    ).toEqual({
      id: "seed@example.com",
      email: "seed@example.com",
      name: "Seed user",
    });
  });

  it("rejects an incorrect password", () => {
    expect(
      verifySeedCredentials(
        {
          email: "seed@example.com",
          password: "wrong-password",
        },
        seedEnvironment,
      ),
    ).toBeNull();
  });

  it("only exposes seed login locally and in Vercel previews", () => {
    expect(isSeedLoginEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isSeedLoginEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(
      isSeedLoginEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe(false);
  });
});
