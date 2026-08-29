import { z } from "zod";

/** Long enough for a pasted bank statement page, short enough to read in one call. */
export const MAX_MESSAGE_LENGTH = 4000;

export const chatMessageSchema = z
  .object({
    message: z.string().trim().min(1, "a message is required").max(MAX_MESSAGE_LENGTH),
  })
  .strict();

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export type ChatMessageResult =
  | { success: true; input: ChatMessageInput }
  | { success: false; issues: { field: string; message: string }[] };

export function parseChatMessageBody(body: unknown): ChatMessageResult {
  const parsed = chatMessageSchema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    };
  }

  return { success: true, input: parsed.data };
}
