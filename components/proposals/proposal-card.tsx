"use client";

import type { ProposalConflict } from "@/lib/proposals/apply";
import type { ProposalKind, ProposalPayload } from "@/lib/proposals/payload";
import type { ProposalView } from "@/lib/proposals/projection";
import {
  cadenceLabel,
  fieldStatusLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
} from "@/lib/subscriptions/format";

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
  onDecide: (proposal: ProposalView, decision: Decision) => void;
}) {
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
            onClick={() => onDecide(proposal, "accept")}
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
        <PayloadFields payload={proposal.payload} />
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
