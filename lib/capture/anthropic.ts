import Anthropic from "@anthropic-ai/sdk";

import {
  CANDIDATE_TOOL_NAME,
  candidateToolInputSchema,
  extractionResultSchema,
  MAX_CANDIDATES,
  type ExtractionCandidate,
} from "./candidates";

export const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = [
  "You read one message from someone recording their own subscriptions and list the subscriptions it mentions.",
  "Call the tool exactly once with every candidate you find, and nothing else.",
  "A pasted list gives one candidate per line or per name, even when a line is only a name.",
  "Record a price, cadence, or renewal date only when the message states it. Never estimate one, never fill one in from what a service usually costs, and leave the field null instead.",
  "Amounts are minor units: £9.99 is 999 with currency GBP.",
  "Quote the words the candidate came from in `evidence`.",
  "Confidence is about identification, not price: high for an unmistakable service name, low for a guess at what the person meant.",
  "If the message mentions no subscription, return an empty list.",
].join("\n");

/** Only the call this module makes, so a test can stand in for the network. */
export type MessageCreator = (
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Messages.Message>;

export type AnthropicExtractorOptions = {
  apiKey: string;
  model?: string;
  createMessage?: MessageCreator;
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
  const createMessage = options.createMessage ?? defaultCreateMessage(options.apiKey);
  const message = await createMessage({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: CANDIDATE_TOOL_NAME,
        description: "Record the subscription candidates found in the message.",
        input_schema: candidateToolInputSchema,
      },
    ],
    tool_choice: { type: "tool", name: CANDIDATE_TOOL_NAME },
    messages: [{ role: "user", content: text }],
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
