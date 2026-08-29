/** Amount text as typed in a form, in major units, e.g. `9.99`. */
export type AmountInput =
  | { ok: true; minor: number | null }
  | { ok: false; message: string };

const AMOUNT_PATTERN = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/**
 * Parses a typed amount into minor units without going through a float.
 * An empty input is a missing amount, not a zero.
 */
export function parseAmountInput(value: string): AmountInput {
  const trimmed = value.trim().replace(/^£\s*/, "").replace(/\s/g, "");

  if (trimmed === "") {
    return { ok: true, minor: null };
  }

  const match = AMOUNT_PATTERN.exec(trimmed);

  if (!match) {
    return { ok: false, message: "Enter an amount like 9.99, or leave it blank." };
  }

  const [, major, fraction = ""] = match;

  return { ok: true, minor: Number(major) * 100 + Number(fraction.padEnd(2, "0")) };
}

/** Minor units back to the text the form shows, so an edit round-trips. */
export function toAmountInput(minor: number | null): string {
  if (minor === null) {
    return "";
  }

  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
