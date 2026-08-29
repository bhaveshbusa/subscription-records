/**
 * A reply that puts the outstanding question off rather than answering it. It is
 * deliberately narrow: anything that could be an answer must reach the extractor,
 * so "later" defers and "£9.99 later this month" does not.
 */
const DEFERRAL_PATTERNS = [
  /\b(?:i'?ll|i will|ill)\s+(?:tell|let)\s+you\b/i,
  /\b(?:i'?ll|i will|ill)\s+(?:check|look|find out|confirm)\b/i,
  /\b(?:tell|ask)\s+(?:you|me)\s+later\b/i,
  /\blater\b/i,
  /\bnot\s+(?:now|sure|yet)\b/i,
  /\b(?:don'?t|do not|dont)\s+know\b/i,
  /\bno\s+idea\b/i,
  /\bdunno\b/i,
  /\bskip\b/i,
  /\bnext\s+time\b/i,
  /\banother\s+time\b/i,
];

/** Digits are a possible answer, so a message carrying any is never a deferral. */
const ANSWER_SHAPED = /\d/;

export function isDeferral(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length === 0 || ANSWER_SHAPED.test(trimmed)) {
    return false;
  }

  return DEFERRAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}
