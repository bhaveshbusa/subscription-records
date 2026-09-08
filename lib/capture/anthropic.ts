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
type Source = "message" | "image" | "document";

function sourcePrompt(source: Source): string[] {
  if (source === "document") {
    return [
      "You read one invoice, receipt, or statement someone exported as a PDF while recording their own subscriptions, and list the subscriptions it bills for.",
      "Read only what the document says. Line items, totals, and dates are stated there: do not carry a figure over from another line and do not guess at one that is missing.",
      "A statement bills for several services at once and gives one candidate per line item.",
      "An invoice or receipt is current terms and a due date, not a payment to store. Use a stated payment date to infer when the next payment is due.",
    ];
  }

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
    "Set `paidOn` when the message states a payment date (today, yesterday, an invoice date), resolving relative words against today's date, and put the stated amount in `amountMinor` as the current cost. `paidOn` is used to infer the next due date; it is not a payment to store. A renewal that is still due is `nextRenewal`, not `paidOn`.",
    "Trials are free. There is no current trial charge. Put a stated trial-end date in `trialEndsOn`, not in `endsOn` or `nextRenewal`. Amount, currency, and cadence on a trial are the paid plan after trial. Leave them null when the paid plan is unknown. Never record 0 merely because the trial is free. Set `subscriptionStatus` to `trial` when the message says it is a trial.",
    "If the person continues after trial, paid service starts at trial end. Do not invent a nextRenewal from the trial end, and do not write a first-payment date later than trial end onto nextRenewal.",
    "Set `autoRenewal` to yes or no only when the message states it. Never infer auto-renewal from cadence. Auto-renewal is not a reminder.",
    "Set `reminderPreferences` only when the person asks to be reminded, or to turn a reminder off. 'Remind me one month before renewal' is renewal enabled with leadValue 1 and leadUnit months. 'Turn that reminder off' is state off. 'Remind me to cancel' is not a reminder preference. Reminder instructions stay proposals until the card is accepted.",
    "If the message describes a paid trial, or a first payment on a different day from trial end, fill `unsupportedStageOne` with reason `paid_trial` or `different_payment_start` and keep the free-trial facts you can record. Do not silently rewrite the stated terms.",
    "Set `lifecycle` only for something the message says has already happened: `cancelled` when the subscription has stopped — including when it stopped without anyone cancelling, such as a failed payment or an expiry — and `cancel_scheduled` when it was cancelled but runs to the end of the paid period. Put a stated end date in `endsOn`.",
    "Resolve relative past dates against today into `endsOn` as YYYY-MM-DD: \"three months ago\" is three calendar months before today, \"in March\" / \"last March\" is that month on today's day-of-month (this year if that date is not in the future, otherwise last year), \"last year\" is twelve calendar months before today. A past `endsOn` is `cancelled`, not `cancel_scheduled`.",
    "Leave `lifecycle` null when the message says the person wants to, should, is about to, or keeps meaning to cancel, and when it only says they do not use or watch the service. Not using a subscription is not cancelling it.",
    "When the message says a subscription was cancelled but not when it stopped, set `lifecycle` to `cancelled` and leave `endsOn` null. The day it stopped is asked about rather than assumed. \"I just cancelled\" with no date is the exception: still leave `endsOn` null, so the app can ask whether it stopped immediately or at the end of the period.",
    "Quote the words the candidate came from in `evidence`, including the cancellation words and any timing (\"three months ago\", \"in March\") when there are any, since the date is read from them.",
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

/**
 * The document's own text layer, which is what a billing portal's invoice is
 * made of. Cheaper and more exact than looking at the pages, so it is tried
 * first and the pages are only read when there is no text to read.
 */
export async function extractPdfTextWithAnthropic(
  text: string,
  options: AnthropicExtractorOptions,
): Promise<ExtractionCandidate[]> {
  return callExtractor(text, "document", options);
}

/**
 * The pages themselves, for a scanned or photographed bill with no text layer.
 * The bytes go inline for the same reason a screenshot's do: the bucket is
 * private and no link to it is ever minted.
 */
export async function extractPdfWithAnthropic(
  pdf: { bytes: Uint8Array },
  options: AnthropicExtractorOptions,
): Promise<ExtractionCandidate[]> {
  return callExtractor(
    [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(pdf.bytes).toString("base64"),
        },
      },
    ],
    "document",
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
