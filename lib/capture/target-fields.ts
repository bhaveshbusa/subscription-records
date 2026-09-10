import { z } from "zod";

/**
 * The explicit context a capture turn is sent against. At most one id is set;
 * none means the turn is about all subscriptions. The ids come from this
 * server's own responses, never from a model, and each is resolved under the
 * session user before anything is read against it.
 */
export const captureTargetFields = {
  /** The holding the turn is about. */
  subscriptionId: z.string().uuid().optional(),
  /** The pending card the turn corrects or completes. */
  proposalId: z.string().uuid().optional(),
  /** The open question this reply is about. Absent means a fresh capture. */
  questionId: z.string().uuid().optional(),
};

export type CaptureTargetInput = {
  subscriptionId?: string;
  proposalId?: string;
  questionId?: string;
};

/**
 * The selected target as the composer shows and persists it: the id it will
 * send, and the words that say what it is. Kept small enough for a URL and
 * local storage; the server re-resolves the id on every request.
 */
export type TargetDescriptor =
  | { kind: "all" }
  | { kind: "subscription"; id: string; provider: string }
  | { kind: "proposal"; id: string; provider: string; subscriptionId: string | null }
  | {
      kind: "question";
      id: string;
      provider: string;
      question: string;
      subscriptionId: string | null;
    };

export function targetInput(descriptor: TargetDescriptor): CaptureTargetInput {
  switch (descriptor.kind) {
    case "all":
      return {};
    case "subscription":
      return { subscriptionId: descriptor.id };
    case "proposal":
      return { proposalId: descriptor.id };
    case "question":
      return { questionId: descriptor.id };
  }
}

/** A stable key for one target, for drafts kept per target and for equality. */
export function targetKey(descriptor: TargetDescriptor): string {
  return descriptor.kind === "all" ? "all" : `${descriptor.kind}:${descriptor.id}`;
}

export function refineOneTarget(input: CaptureTargetInput, context: z.RefinementCtx): void {
  const set = [input.subscriptionId, input.proposalId, input.questionId].filter(Boolean);

  if (set.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subscriptionId"],
      message: "send one of subscriptionId, proposalId, or questionId",
    });
  }
}
