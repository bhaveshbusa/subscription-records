"use client";

import { useState } from "react";

import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalPayload } from "@/lib/proposals/payload";
import { formatMoneyMinor } from "@/lib/subscriptions/format";
import { parseAmountInput, toAmountInput } from "@/lib/subscriptions/money";
import { CADENCES, type Cadence } from "@/lib/subscriptions/params";

export type TermsDraft = { amount: string; cadence: Cadence | ""; nextRenewal: string };

export const EMPTY_DRAFT: TermsDraft = { amount: "", cadence: "", nextRenewal: "" };

export type DraftResult =
  | { ok: true; confirm: ConfirmedTerms | undefined }
  | { ok: false; message: string };

/**
 * A blank field stays proposed. Only what the person typed or ticked becomes
 * `confirmed`, which is why accepting identity alone leaves money untrusted.
 */
export function toConfirmedTerms(draft: TermsDraft, currency: string): DraftResult {
  const amount = parseAmountInput(draft.amount);

  if (!amount.ok) {
    return { ok: false, message: amount.message };
  }

  const confirm: ConfirmedTerms = {};

  if (amount.minor !== null) {
    confirm.amountMinor = amount.minor;
    confirm.currency = currency;
  }

  if (draft.cadence !== "") {
    confirm.cadence = draft.cadence;
  }

  if (draft.nextRenewal !== "") {
    confirm.nextRenewal = draft.nextRenewal;
  }

  return {
    ok: true,
    confirm: Object.keys(confirm).length === 0 ? undefined : confirm,
  };
}

function quoted(payload: ProposalPayload): TermsDraft | null {
  const draft: TermsDraft = {
    amount:
      payload.amountMinor === undefined ? "" : toAmountInput(payload.amountMinor.value),
    cadence: payload.cadence?.value ?? "",
    nextRenewal: payload.nextRenewal?.value ?? "",
  };

  return draft.amount === "" && draft.cadence === "" && draft.nextRenewal === ""
    ? null
    : draft;
}

const INPUT_CLASS =
  "rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-emerald-700";

const LABEL_CLASS =
  "flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500";

/**
 * The money half of a proposal card. The extractor's numbers are a quote, not a
 * decision: they only turn into confirmed values when someone fills this in.
 */
export function ConfirmTerms({
  payload,
  draft,
  disabled,
  onChange,
}: {
  payload: ProposalPayload;
  draft: TermsDraft;
  disabled: boolean;
  onChange: (draft: TermsDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const currency = payload.currency ?? "GBP";
  const quote = quoted(payload);

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
          disabled={disabled}
          onClick={() => setOpen(true)}
          type="button"
        >
          Confirm money
        </button>
        {quote?.amount ? (
          <button
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:border-emerald-600 disabled:opacity-60"
            disabled={disabled}
            onClick={() => {
              onChange(quote);
              setOpen(true);
            }}
            type="button"
          >
            {`That's right: ${formatMoneyMinor(payload.amountMinor?.value ?? 0, currency)}`}
          </button>
        ) : null}
        <p className="text-xs text-stone-500">
          Accepting without this keeps the amount proposed, not confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-3">
      <label className={LABEL_CLASS}>
        Amount
        <input
          className={INPUT_CLASS}
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => onChange({ ...draft, amount: event.target.value })}
          placeholder="9.99"
          value={draft.amount}
        />
      </label>
      <label className={LABEL_CLASS}>
        Cadence
        <select
          className={INPUT_CLASS}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, cadence: event.target.value as Cadence | "" })
          }
          value={draft.cadence}
        >
          <option value="">Leave unconfirmed</option>
          {CADENCES.map((cadence) => (
            <option key={cadence} value={cadence}>
              {cadence}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL_CLASS}>
        Next renewal
        <input
          className={INPUT_CLASS}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, nextRenewal: event.target.value })}
          type="date"
          value={draft.nextRenewal}
        />
      </label>
      <p className="text-xs font-normal normal-case tracking-normal text-stone-500 sm:col-span-3">
        Anything you fill in is saved as confirmed in {currency}. Leave a field blank to keep
        it proposed.
      </p>
    </div>
  );
}
