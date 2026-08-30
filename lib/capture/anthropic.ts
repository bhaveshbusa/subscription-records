import Anthropic from "@anthropic-ai/sdk";

import { today } from "@/lib/subscriptions/query";

import type { ImageMediaType } from "./image";
import {
  CANDIDATE_TOOL_NAME,
  candidateToolInputSchema,
  extractionResultSchema,
  MAX_CANDIDATES,
  type ExtractionCandidate,
} from "./candidates";

export const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2048;

/** What the model is looking at, which changes how it should read it and nothing else. */
type Source = "message" | "image";

function sourcePrompt(source: Source): string[] {
  if (source === "image") {
    return [
      "You read one screenshot or photo taken by someone recording their own subscriptions - a receipt, a billing email, an account page, a bank line - and list the subscriptions it shows.",
      "Read only what the image shows. Do not describe the image, do not guess at text you cannot make out, and return an empty list when it shows no subscription.",
      "A statement or list shows one candidate per line, even when a line is only a name.",
    ];
  }

  return [
    "You read one message from someone recording their own subscriptions and list the subscriptions it mentions.",
    "A pasted list gives one candidate per line or per name, even when a line is only a name.",
  ];
}

function systemPrompt(today: string, source: Source): string {
  return [
    `Today is ${today}.`,
    ...sourcePrompt(source),
    "Call the tool exactly once with every candidate you find, and nothing else.",
    "Record a price, cadence, or renewal date only when the message states it. Never estimate one, never fill one in from what a service usually costs, and leave the field null instead.",
    "Amounts are minor units: £9.99 is 999 with currency GBP.",
    "Set `paidOn` when the message says a payment has already been made, resolving words like today or yesterday against today's date, and put the amount paid in `amountMinor`. A renewal that is still due is `nextRenewal`, not `paidOn`.",
    "Set `lifecycle` only for something the message says has already happened: `cancelled` when the subscription has stopped, `cancel_scheduled` when it was cancelled but runs to the end of the paid period, `lapsed` when it stopped without anyone cancelling. Put a stated end date in `endsOn`.",
    "Leave `lifecycle` null when the message says the person wants to, should, is about to, or keeps meaning to cancel, and when it only says they do not use or watch the service. Not using a subscription is not cancelling it.",
    "When the message says a subscription was cancelled but not whether it stopped immediately or at the end of the period, set `lifecycle` to `cancelled` and leave `endsOn` null. The timing is asked about rather than assumed.",
    "Quote the words the candidate came from in `evidence`, including the cancellation words when there are any, since the timing is read from them.",
    "Confidence is about identification, not price: high for an unmistakable service name, low for a guess at what the person meant.",
    "If there is no subscription, return an empty list.",
  ].join("\n");
}

/** Only the call this module makes, so a test can stand in for the network. */
export type MessageCreator = (
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Messages.Message>;

export type AnthropicExtractorOptions = {
  apiKey: string;
  model?: string;
  createMessage?: MessageCreator;
  /** The day the message arrived, so "paid today" becomes a date. */
  now?: Date;
};

function defaultCreateMessage(apiKey: string): MessageCreator {
  const client = new Anthropic({ apiKey });

  return (params) => client.messages.create(params);
}

/**
 * Throws when the model cannot be reached or answers with something the schema
 * rejects; the caller turns that into a visible failure rather than a silent
 * empty result, so a broken key never looks like "no subscriptions found".
 */
export async function extractWithAnthropic(
  text: string,
  options: AnthropicExtractorOptions,
): Promise<ExtractionCandidate[]> {
  return callExtractor(text, "message", options);
}

/**
 * The same reading, on pixels. The image is sent inline rather than as a URL:
 * the bucket is private and stays that way, so the model is handed bytes the
 * server already holds instead of a link anyone could follow.
 */
export async function extractImageWithAnthropic(
  image: { bytes: Uint8Array; mediaType: ImageMediaType },
  options: AnthropicExtractorOptions,
): Promise<ExtractionCandidate[]> {
  return callExtractor(
    [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: Buffer.from(image.bytes).toString("base64"),
        },
      },
    ],
    "image",
    options,
  );
}

async function callExtractor(
  content: string | Anthropic.Messages.ContentBlockParam[],
  source: Source,
  options: AnthropicExtractorOptions,
): Promise<ExtractionCandidate[]> {
  const createMessage = options.createMessage ?? defaultCreateMessage(options.apiKey);
  const message = await createMessage({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt(today(options.now ?? new Date()), source),
    tools: [
      {
        name: CANDIDATE_TOOL_NAME,
        description: "Record the subscription candidates found in the message.",
        input_schema: candidateToolInputSchema,
      },
    ],
    tool_choice: { type: "tool", name: CANDIDATE_TOOL_NAME },
    messages: [{ role: "user", content }],
  });

  const call = message.content.find(
    (block) => block.type === "tool_use" && block.name === CANDIDATE_TOOL_NAME,
  );

  if (!call || call.type !== "tool_use") {
    throw new Error("the model answered without recording candidates");
  }

  const parsed = extractionResultSchema.safeParse(call.input);

  if (!parsed.success) {
    throw new Error(
      `the model's candidates did not validate: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "candidates"} ${issue.message}`)
        .join("; ")}`,
    );
  }

  return parsed.data.candidates.slice(0, MAX_CANDIDATES);
}
