"use client";

import type { TermsEdit, TermsIntent } from "@/lib/subscriptions/form-values";
import { cadenceLabel, formatMoneyMinor } from "@/lib/subscriptions/format";

const DATE_INPUT_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

/**
 * What this edit does to the terms in force, said plainly before anyone is
 * asked to classify it. A replaced value shows what it replaces; a blank being
 * filled says so, because "nothing → £12.99" is the difference between
 * completing a record and changing a price.
 */
export function TermsEditList({
  edits,
  currency,
}: {
  edits: TermsEdit[];
  currency: string;
}) {
  if (edits.length === 0) {
    return null;
  }

  const say = (edit: TermsEdit, side: "from" | "to") => {
    const value = edit[side];

    if (value === null) {
      return "not recorded";
    }

    if (edit.field === "amount") {
      const code =
        (side === "from" ? edit.fromCurrency : edit.toCurrency) ?? currency;

      return formatMoneyMinor(value as number, code);
    }

    return edit.field === "cadence"
      ? cadenceLabel(value as never)
      : String(value);
  };

  return (
    <dl className="mt-3 flex flex-col gap-1 text-sm text-stone-700">
      {edits.map((edit) => (
        <div className="flex flex-wrap items-baseline gap-2" key={edit.field}>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            {edit.field === "amount"
              ? "Amount"
              : edit.field === "cadence"
                ? "Cadence"
                : "Plan"}
          </dt>
          <dd className="tabular-nums">
            {say(edit, "from")} <span aria-label="becomes">→</span>{" "}
            {say(edit, "to")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EffectiveFrom({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-4 flex max-w-xs flex-col gap-1 text-sm font-semibold text-stone-900">
      Effective from
      <input
        className={DATE_INPUT_CLASS}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required
        type="date"
        value={value}
      />
      <span className="text-xs font-normal text-stone-600">
        The day the new terms started
      </span>
    </label>
  );
}

/**
 * A recorded term was replaced, so only the person editing knows whether the
 * old value was wrong or the price really moved. Required before saving.
 */
export function TermsIntentChoice({
  edits,
  currency,
  intent,
  effectiveFrom,
  onIntentChange,
  onEffectiveFromChange,
  name = "termsIntent",
}: {
  edits: TermsEdit[];
  currency: string;
  intent: TermsIntent | null;
  effectiveFrom: string;
  onIntentChange: (intent: TermsIntent) => void;
  onEffectiveFromChange: (value: string) => void;
  /** Radio group name, unique when several editors share a page. */
  name?: string;
}) {
  return (
    <fieldset className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <legend className="text-sm font-semibold text-stone-900">
        Is this a correction or did the terms actually change?
      </legend>
      <p className="mt-2 text-sm text-stone-600">
        A correction fixes a wrong recorded value in place. A terms change keeps
        the prior price or plan in history and needs the day the new terms took
        effect.
      </p>
      <TermsEditList currency={currency} edits={edits} />
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm font-medium text-stone-800">
          <input
            checked={intent === "correction"}
            className="mt-1 h-4 w-4 accent-emerald-800"
            name={name}
            onChange={() => onIntentChange("correction")}
            type="radio"
            value="correction"
          />
          <span>Correction — this value was recorded wrongly</span>
        </label>
        <label className="flex items-start gap-2 text-sm font-medium text-stone-800">
          <input
            checked={intent === "terms_change"}
            className="mt-1 h-4 w-4 accent-emerald-800"
            name={name}
            onChange={() => onIntentChange("terms_change")}
            type="radio"
            value="terms_change"
          />
          <span>The price or plan actually changed</span>
        </label>
      </div>
      {intent === "terms_change" ? (
        <EffectiveFrom
          name={`${name}EffectiveFrom`}
          onChange={onEffectiveFromChange}
          value={effectiveFrom}
        />
      ) : null}
    </fieldset>
  );
}

/** Filling a blank is ordinary completion, but the person may still date a real change. */
export function TermsChangeOffer({
  edits,
  currency,
  intent,
  effectiveFrom,
  onIntentChange,
  onEffectiveFromChange,
  name = "termsChanged",
}: {
  edits: TermsEdit[];
  currency: string;
  intent: TermsIntent | null;
  effectiveFrom: string;
  onIntentChange: (intent: TermsIntent | null) => void;
  onEffectiveFromChange: (value: string) => void;
  name?: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <TermsEditList currency={currency} edits={edits} />
      <label className="mt-3 flex items-start gap-2 text-sm font-medium text-stone-800">
        <input
          checked={intent === "terms_change"}
          className="mt-1 h-4 w-4 accent-emerald-800"
          name={name}
          onChange={(event) =>
            onIntentChange(event.target.checked ? "terms_change" : null)
          }
          type="checkbox"
        />
        <span>
          The price or plan actually changed on a particular day
          <span className="block text-xs font-normal text-stone-600">
            Optional. Saving without this records what you filled in and asks
            nothing else. Tick it to keep the earlier terms in history from a
            date you name.
          </span>
        </span>
      </label>
      {intent === "terms_change" ? (
        <EffectiveFrom
          name={`${name}EffectiveFrom`}
          onChange={onEffectiveFromChange}
          value={effectiveFrom}
        />
      ) : null}
    </div>
  );
}
