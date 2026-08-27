import { createHash, timingSafeEqual } from "node:crypto";

type Credentials = Partial<Record<"email" | "password", unknown>>;

type SeedEnvironment = {
  [key: string]: string | undefined;
  SEED_EMAIL?: string;
  SEED_PASSWORD?: string;
};

function equalSecret(actual: string, expected: string) {
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(actualHash, expectedHash);
}

export function verifySeedCredentials(
  credentials: Credentials | undefined,
  environment: SeedEnvironment = process.env,
) {
  const email = credentials?.email;
  const password = credentials?.password;
  const seedEmail = environment.SEED_EMAIL;
  const seedPassword = environment.SEED_PASSWORD;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !seedEmail ||
    !seedPassword ||
    email.trim().toLowerCase() !== seedEmail.trim().toLowerCase() ||
    !equalSecret(password, seedPassword)
  ) {
    return null;
  }

  return {
    id: seedEmail.trim().toLowerCase(),
    email: seedEmail.trim().toLowerCase(),
    name: "Seed user",
  };
}
