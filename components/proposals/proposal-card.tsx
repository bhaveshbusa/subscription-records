"use client";

import { useState } from "react";

import type { ProposalConflict } from "@/lib/proposals/apply";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import {
  isLifecycleKind,
  type ProposalKind,
  type ProposalPayload,
} from "@/lib/proposals/payload";
import type { ProposalView } from "@/lib/proposals/projection";
import {
  cadenceLabel,
  fieldStatusLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
} from "@/lib/subscriptions/format";

import {
  ConfirmTerms,
  EMPTY_DRAFT,
  toConfirmedTerms,
  type TermsDraft,
} from "./confirm-terms";

export type Decision = "accept" | "reject";

export const KIND_LABEL: Record<ProposalKind, string> = {
  create: "New subscription",
  update: "Update",
  charged: "Charge",
  terms_changed: "Terms changed",
  cancel_scheduled: "Cancel scheduled",
  cancelled: "Cancelled",
  reactivated: "Reactivated",
  lapsed: "Lapsed",
};

export const CONFLICT_LABEL: Record<ProposalConflict, string> = {
  provider: "provider",
  status: "status",
  amount: "amount",
  cadence: "cadence",
  nextRenewal: "next renewal",
};

export function proposalTitle(proposal: ProposalView) {
  return (
    proposal.payload?.provider?.value ?? proposal.subscriptionProvider ?? "Unknown provider"
  );
}

function Field({ label, value, status }: { label: string; value: string; status?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-stone-900">{value}</p>
      {status ? <p className="mt-0.5 text-xs text-stone-500">{status}</p> : null}
    </div>
  );
}

function PayloadFields({ payload }: { payload: ProposalPayload }) {
  const currency = payload.currency ?? "GBP";

  return (
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field
        label="Amount"
        status={payload.amountMinor ? fieldStatusLabel(payload.amountMinor.status) : "Missing"}
        value={
          payload.amountMinor ? formatMoneyMinor(payload.amountMinor.value, currency) : "—"
        }
      />
      <Field
        label="Cadence"
        status={payload.cadence ? fieldStatusLabel(payload.cadence.status) : "Missing"}
        value={payload.cadence ? cadenceLabel(payload.cadence.value) : "—"}
      />
      <Field
        label="Next renewal"
        status={payload.nextRenewal ? fieldStatusLabel(payload.nextRenewal.status) : "Missing"}
        value={formatDate(payload.nextRenewal?.value ?? null)}
      />
      <Field
        label="Status"
        status={
          payload.subscriptionStatus
            ? fieldStatusLabel(payload.subscriptionStatus.status)
            : "Missing"
        }
        value={payload.subscriptionStatus ? statusLabel(payload.subscriptionStatus.value) : "—"}
      />
    </div>
  );
}

/**
 * An ending changes no terms, so the card shows only what it does: the status the
 * subscription moves to and, for a cancellation that runs on, the day it stops.
 */
function LifecycleFields({ payload }: { payload: ProposalPayload }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field
        label="Status"
        value={
          payload.subscriptionStatus ? statusLabel(payload.subscriptionStatus.value) : "—"
        }
      />
      <Field label="Ends" value={formatDate(payload.endsOn ?? null)} />
    </div>
  );
}

/** A payment is not a change of terms, so the card shows only what was paid. */
function ChargeFields({ charge }: { charge: NonNullable<ProposalPayload["charge"]> }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field label="Paid" value={formatMoneyMinor(charge.amountMinor, charge.currency)} />
      <Field label="Paid on" value={formatDate(charge.paidOn)} />
    </div>
  );
}

/** The inbox card, shared with `/chat` so a proposal reads the same in both. */
export function ProposalCard({
  proposal,
  busy,
  working,
  onDecide,
}: {
  proposal: ProposalView;
  /** Any decision is in flight, so every button waits. */
  busy: boolean;
  /** This card is the one being decided. */
  working: boolean;
  onDecide: (
    proposal: ProposalView,
    decision: Decision,
    confirm?: ConfirmedTerms,
  ) => void;
}) {
  const [draft, setDraft] = useState<TermsDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const charge = proposal.payload?.charge ?? null;
  const ending = isLifecycleKind(proposal.kind);
  /** A restart is about the terms it comes back on, and the payment if there was one. */
  const restarting = proposal.kind === "reactivated";

  function accept() {
    const terms = toConfirmedTerms(draft, proposal.payload?.currency ?? "GBP");

    if (!terms.ok) {
      setDraftError(terms.message);

      return;
    }

    setDraftError(null);
    onDecide(proposal, "accept", terms.confirm);
  }

  return (
    <div className="rounded-3xl border border-stone-200 bg-white/80 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
            {KIND_LABEL[proposal.kind]}
          </p>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-stone-950">
            {proposalTitle(proposal)}
          </h2>
          {proposal.payload?.plan ? (
            <p className="text-sm text-stone-600">{proposal.payload.plan}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            disabled={busy || !proposal.appliable || !proposal.payload}
            onClick={accept}
            type="button"
          >
            {working ? "Working…" : "Accept"}
          </button>
          <button
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
            disabled={busy}
            onClick={() => onDecide(proposal, "reject")}
            type="button"
          >
            Reject
          </button>
        </div>
      </div>

      {proposal.payload ? (
        <>
          {restarting ? (
            <>
              <PayloadFields payload={proposal.payload} />
              {charge ? <ChargeFields charge={charge} /> : null}
            </>
          ) : charge ? (
            <ChargeFields charge={charge} />
          ) : ending ? (
            <LifecycleFields payload={proposal.payload} />
          ) : (
            <PayloadFields payload={proposal.payload} />
          )}
          {proposal.appliable && !charge && !ending ? (
            <ConfirmTerms
              disabled={busy}
              draft={draft}
              onChange={setDraft}
              payload={proposal.payload}
            />
          ) : null}
          {draftError ? (
            <p className="mt-2 text-sm text-red-800">{draftError}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-red-800">
          This proposal&apos;s data no longer validates, so it can only be rejected.
        </p>
      )}

      {!proposal.appliable ? (
        <p className="mt-4 text-sm text-stone-600">
          {KIND_LABEL[proposal.kind]} proposals cannot be applied yet.
        </p>
      ) : null}

      {proposal.rationale ? (
        <p className="mt-4 text-sm text-stone-600">{proposal.rationale}</p>
      ) : null}
      {proposal.confidence ? (
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-500">
          Confidence {proposal.confidence}
        </p>
      ) : null}
    </div>
  );
}
