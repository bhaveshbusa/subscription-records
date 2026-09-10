"use client";

import { useState, type ReactNode } from "react";

import type { ProposalConflict } from "@/lib/proposals/apply";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import {
  isLifecycleKind,
  type ProposalKind,
  type ProposalPayload,
} from "@/lib/proposals/payload";
import type { ProposalView } from "@/lib/proposals/projection";
import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/subscriptions/params";
import {
  amountFieldLabel,
  autoRenewalLabel,
  cadenceFieldLabel,
  cadenceLabel,
  fieldStatusLabel,
  formatDate,
  formatMoneyMinor,
  reminderConsentLabel,
  reminderLeadLabel,
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
  /** Historical, rewritten by `0013_drop_lapsed`. */
  lapsed: "Cancelled",
};

export const CONFLICT_LABEL: Record<ProposalConflict, string> = {
  provider: "provider",
  status: "status",
  amount: "amount",
  cadence: "cadence",
  nextRenewal: "next renewal",
  trialEndsOn: "trial end",
  autoRenewal: "auto-renewal",
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

function hasLedgerTerms(payload: ProposalPayload) {
  return Boolean(
    payload.provider ||
      payload.amountMinor ||
      payload.cadence ||
      payload.nextRenewal ||
      payload.subscriptionStatus ||
      payload.trialEndsOn ||
      payload.autoRenewal,
  );
}

/**
 * The status the card reads out of the message, as something the person can
 * change before they accept it. Accepting establishes whatever is shown here, so
 * there is no second question about it afterwards - and picking a status
 * confirms nothing else on the card.
 */
function StatusChoice({
  value,
  disabled,
  onChange,
}: {
  value: ReviewStatus;
  disabled: boolean;
  onChange: (status: ReviewStatus) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Status
      </span>
      <select
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-900 outline-none transition focus:border-emerald-700 disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ReviewStatus)}
        value={value}
      >
        {REVIEW_STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabel(status)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A status the card can offer as a choice; an ending is a lifecycle action. */
function reviewStatus(payload: ProposalPayload): ReviewStatus | null {
  const value = payload.subscriptionStatus?.value;

  return value && (REVIEW_STATUSES as readonly string[]).includes(value)
    ? (value as ReviewStatus)
    : null;
}

function PayloadFields({
  payload,
  statusControl = null,
}: {
  payload: ProposalPayload;
  statusControl?: ReactNode;
}) {
  const currency = payload.currency ?? "GBP";
  const trial = payload.subscriptionStatus?.value === "trial";
  const reminder = payload.reminderPreferences;
  const showTerms = hasLedgerTerms(payload);

  return (
    <>
      {showTerms ? (
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field
          label={amountFieldLabel(payload.subscriptionStatus?.value ?? "unknown")}
          status={payload.amountMinor ? fieldStatusLabel(payload.amountMinor.status) : "Missing"}
          value={
            payload.amountMinor ? formatMoneyMinor(payload.amountMinor.value, currency) : "—"
          }
        />
        <Field
          label={cadenceFieldLabel(payload.subscriptionStatus?.value ?? "unknown")}
          status={payload.cadence ? fieldStatusLabel(payload.cadence.status) : "Missing"}
          value={payload.cadence ? cadenceLabel(payload.cadence.value) : "—"}
        />
        <Field
          label="Next renewal"
          status={payload.nextRenewal ? fieldStatusLabel(payload.nextRenewal.status) : "Missing"}
          value={formatDate(payload.nextRenewal?.value ?? null)}
        />
        {statusControl ?? (
          <Field
            label="Status"
            status={
              payload.subscriptionStatus
                ? fieldStatusLabel(payload.subscriptionStatus.status)
                : "Missing"
            }
            value={
              payload.subscriptionStatus ? statusLabel(payload.subscriptionStatus.value) : "—"
            }
          />
        )}
        {trial || payload.trialEndsOn ? (
        <Field
          label="Trial ends on"
          status={
            payload.trialEndsOn ? fieldStatusLabel(payload.trialEndsOn.status) : "Missing"
          }
          value={formatDate(payload.trialEndsOn?.value ?? null)}
        />
        ) : null}
        {trial || payload.autoRenewal ? (
        <Field
          label="Auto-renewal"
          status={
            payload.autoRenewal ? fieldStatusLabel(payload.autoRenewal.status) : "Missing"
          }
          value={autoRenewalLabel(payload.autoRenewal?.value ?? null)}
        />
        ) : null}
      </div>
      ) : null}
      {reminder ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {reminder.renewal ? (
            <Field
              label="Renewal reminder"
              value={
                reminder.renewal.state === "off"
                  ? reminderConsentLabel("off")
                  : `${reminderConsentLabel("enabled")} · ${reminderLeadLabel(reminder.renewal.leadValue, reminder.renewal.leadUnit)}`
              }
            />
          ) : null}
          {reminder.trialEnd ? (
            <Field
              label="Trial-end reminder"
              value={
                reminder.trialEnd.state === "off"
                  ? reminderConsentLabel("off")
                  : `${reminderConsentLabel("enabled")} · ${reminderLeadLabel(reminder.trialEnd.leadValue, reminder.trialEnd.leadUnit)}`
              }
            />
          ) : null}
        </div>
      ) : null}
      {payload.unsupportedStageOne ? (
        <p className="mt-4 text-sm text-amber-900">{payload.unsupportedStageOne.detail}</p>
      ) : null}
    </>
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
  const shownStatus = proposal.payload ? reviewStatus(proposal.payload) : null;
  /** Editable on a card that can be applied; an ending's status is its point. */
  const editableStatus =
    shownStatus && proposal.appliable && !charge && !ending ? shownStatus : null;
  /** A restart is about the terms it comes back on, and the payment if there was one. */
  const restarting = proposal.kind === "reactivated";

  function accept() {
    const terms = toConfirmedTerms(
      draft,
      proposal.payload?.currency ?? "GBP",
      shownStatus ?? undefined,
    );

    if (!terms.ok) {
      setDraftError(terms.message);

      return;
    }

    setDraftError(null);
    onDecide(proposal, "accept", terms.confirm);
  }

  const statusControl = editableStatus ? (
    <StatusChoice
      disabled={busy}
      onChange={(status) => setDraft({ ...draft, status })}
      value={draft.status === "" ? editableStatus : draft.status}
    />
  ) : null;

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
              <PayloadFields payload={proposal.payload} statusControl={statusControl} />
              {charge ? <ChargeFields charge={charge} /> : null}
            </>
          ) : charge ? (
            <ChargeFields charge={charge} />
          ) : ending ? (
            <LifecycleFields payload={proposal.payload} />
          ) : (
            <PayloadFields payload={proposal.payload} statusControl={statusControl} />
          )}
          {proposal.appliable && !charge && !ending && hasLedgerTerms(proposal.payload) ? (
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
          <p className="mt-4 text-xs text-stone-500">
            Accepting without confirming money keeps those fields proposed. Accepting a
            reminder saves that preference. If this card cannot be edited enough, reject it
            and recapture, or edit the record by hand.
          </p>
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
