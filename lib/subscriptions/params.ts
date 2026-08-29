import { z } from "zod";

export const SUBSCRIPTION_STATUSES = [
  "unknown",
  "trial",
  "active",
  "paused",
  "cancel_scheduled",
  "cancelled",
  "lapsed",
] as const;

export const CADENCES = ["weekly", "monthly", "yearly"] as const;

export const SORT_KEYS = [
  "provider",
  "nextRenewal",
  "monthlyEquivalent",
  "updatedAt",
] as const;

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

const statusSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(z.enum(SUBSCRIPTION_STATUSES)).min(1));

const booleanSchema = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const integerSchema = z
  .string()
  .regex(/^\d+$/, "must be a positive integer")
  .transform((value) => Number.parseInt(value, 10));

export const listQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    status: statusSchema.optional(),
    renewingWithinDays: integerSchema.pipe(z.number().int().min(0).max(3650)).optional(),
    needsAttention: booleanSchema.optional(),
    sort: z.enum(SORT_KEYS).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: integerSchema.pipe(z.number().int().min(1).max(MAX_LIMIT)).optional(),
    cursor: z.string().min(1).optional(),
  })
  .transform((query) => ({
    ...query,
    sort: query.sort ?? "nextRenewal",
    order: query.order ?? "asc",
    limit: query.limit ?? DEFAULT_LIMIT,
  }));

export type ListQuery = z.infer<typeof listQuerySchema>;

export type ListQueryResult =
  | { success: true; query: ListQuery }
  | { success: false; issues: { field: string; message: string }[] };

export function parseListQuery(searchParams: URLSearchParams): ListQueryResult {
  const raw: Record<string, string> = {};

  for (const key of [
    "q",
    "status",
    "renewingWithinDays",
    "needsAttention",
    "sort",
    "order",
    "limit",
    "cursor",
  ]) {
    const value = searchParams.get(key);

    if (value !== null && value !== "") {
      raw[key] = value;
    }
  }

  const parsed = listQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      })),
    };
  }

  return { success: true, query: parsed.data };
}
