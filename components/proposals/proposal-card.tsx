"use client";

import { useState, type ReactNode } from "react";

import {
  AmountInput,
  AutoRenewalInput,
  CadenceInput,
  DateInput,
  FieldReview,
  InlineEditorActions,
  useCloseEditor,
} from "@/components/fields/field-review";
import type { HoldingOption } from "@/lib/capture/match";
import {
  acceptLabel,
  confirmSummary,
  isStaged,
  stageTerm,
  toAcceptConfirm,
  unstageTerm,
  type StagedTerm,
} from "@/lib/fields/review";
import type { ProposalConflict } from "@/lib/proposals/apply";
import type { RetargetAction } from "@/lib/proposals/retarget";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import {
  isLifecycleKind,
  type ProposalKind,
  type ProposalPayload,
} from "@/lib/proposals/payload";
import type { ProposalView } from "@/lib/proposals/projection";
import { parseAmountInput, toAmountInput } from "@/lib/subscriptions/money";
import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/subscriptions/params";
import type { FieldStatus } from "@/lib/subscriptions/projection";
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
    proposal.payload?.provider?.value ??
    proposal.subscriptionProvider ??
    "Unknown provider"
  );
}

function Field({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-stone-900">
        {value}
      </p>
      {status ? (
        <p className="mt-0.5 text-xs text-stone-500">{status}</p>
      ) : null}
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

/** How a holding on offer is named: its account or plan, so the right one can be picked. */
function holdingLabel(option: HoldingOption): string {
  const detail = option.accountHint ?? option.plan;

  return detail ? `${option.provider} · ${detail}` : option.provider;
}

const CORRECTION_INPUT =
  "rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-emerald-700";

const CORRECTION_LABEL =
  "flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500";

/**
 * The identity half of a `create` card. A misheard name is not a price the
 * person confirms — it is which holding the card is about, so correcting it
 * re-runs matching, and each holding the card still resembles is offered as
 * "Use existing …": retargeting the card at it instead of adding a second
 * record of the same subscription. Either move leaves every money and date
 * field on the card exactly as proposed as it was.
 */
function IdentityCorrection({
  proposal,
  busy,
  onRetarget,
}: {
  proposal: ProposalView;
  busy: boolean;
  onRetarget: (proposal: ProposalView, action: RetargetAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(
    proposal.payload?.provider?.value ?? "",
  );
  const [plan, setPlan] = useState(proposal.payload?.plan ?? "");
  const [account, setAccount] = useState(proposal.payload?.accountHint ?? "");
  const matches = proposal.likelyMatches;

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      {matches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-stone-600">
            Already in your ledger?
          </span>
          {matches.map((option) => (
            <button
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:border-emerald-600 disabled:opacity-60"
              disabled={busy}
              key={option.subscriptionId}
              onClick={() =>
                onRetarget(proposal, { useExisting: option.subscriptionId })
              }
              type="button"
            >
              {`Use existing ${holdingLabel(option)}`}
            </button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={CORRECTION_LABEL}>
            Provider
            <input
              className={CORRECTION_INPUT}
              disabled={busy}
              onChange={(event) => setProvider(event.target.value)}
              value={provider}
            />
          </label>
          <label className={CORRECTION_LABEL}>
            Plan
            <input
              className={CORRECTION_INPUT}
              disabled={busy}
              onChange={(event) => setPlan(event.target.value)}
              value={plan}
            />
          </label>
          <label className={CORRECTION_LABEL}>
            Account
            <input
              className={CORRECTION_INPUT}
              disabled={busy}
              onChange={(event) => setAccount(event.target.value)}
              value={account}
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-3">
            <button
              className="rounded-xl bg-emerald-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
              disabled={busy || provider.trim().length === 0}
              onClick={() =>
                onRetarget(proposal, {
                  provider: provider.trim(),
                  plan: plan.trim() || null,
                  accountHint: account.trim() || null,
                })
              }
              type="button"
            >
              Update card
            </button>
            <p className="text-xs text-stone-500">
              Correcting the provider re-checks it against your ledger. Nothing
              here confirms a price or a date.
            </p>
          </div>
        </div>
      ) : (
        <button
          className="mt-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
          disabled={busy}
          onClick={() => setOpen(true)}
          type="button"
        >
          Wrong provider or account?
        </button>
      )}
    </div>
  );
}

type Staged = {
  value: ConfirmedTerms;
  onChange: (next: ConfirmedTerms) => void;
};

/** The trust the card shows for a term: staged means confirmed on accept. */
function shownStatus(
  staged: boolean,
  field: { status: FieldStatus } | undefined,
): { status: FieldStatus; note?: string } {
  if (staged) {
    return { status: "confirmed", note: "Confirmed when you accept" };
  }

  return { status: field?.status ?? "empty" };
}

/**
 * The terms an accepted card will write, each with its own Confirm, Edit or
 * Add. Confirming or editing one term stages exactly that term; the rest keep
 * the trust the extractor gave them until the person acts on them too.
 */
function PayloadFields({
  payload,
  statusControl = null,
  staged,
  disabled = false,
}: {
  payload: ProposalPayload;
  statusControl?: ReactNode;
  /** Absent on a card that cannot be applied, which is read-only. */
  staged?: Staged;
  disabled?: boolean;
}) {
  const currency = staged?.value.currency ?? payload.currency ?? "GBP";
  const trial = payload.subscriptionStatus?.value === "trial";
  const reminder = payload.reminderPreferences;
  const showTerms = hasLedgerTerms(payload);
  const status = payload.subscriptionStatus?.value ?? "unknown";
  const stage = <K extends StagedTerm>(
    field: K,
    value: NonNullable<ConfirmedTerms[K]>,
    withCurrency?: string,
  ) => staged?.onChange(stageTerm(staged.value, field, value, withCurrency));
  const undo = (field: StagedTerm) =>
    staged
      ? () => staged.onChange(unstageTerm(staged.value, field))
      : undefined;
  const amountMinor =
    staged?.value.amountMinor ?? payload.amountMinor?.value ?? null;
  const cadence = staged?.value.cadence ?? payload.cadence?.value ?? null;
  const nextRenewal =
    staged?.value.nextRenewal ?? payload.nextRenewal?.value ?? null;
  const trialEndsOn =
    staged?.value.trialEndsOn ?? payload.trialEndsOn?.value ?? null;
  const autoRenewal =
    staged?.value.autoRenewal ?? payload.autoRenewal?.value ?? null;
  const on = (field: StagedTerm) =>
    staged ? isStaged(staged.value, field) : false;

  return (
    <>
      {payload.provider && staged ? (
        <div className="mt-4">
          <FieldReview
            disabled={disabled}
            hasValue
            label="Provider"
            onConfirm={() => stage("provider", true)}
            onUndo={on("provider") ? undo("provider") : undefined}
            value={payload.provider.value}
            {...shownStatus(on("provider"), payload.provider)}
          />
        </div>
      ) : null}
      {showTerms ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FieldReview
            disabled={disabled}
            editor={
              staged ? (
                <AmountEditor
                  amountMinor={amountMinor}
                  currency={currency}
                  onStage={(minor, code) => stage("amountMinor", minor, code)}
                />
              ) : undefined
            }
            hasValue={amountMinor !== null}
            label={amountFieldLabel(status)}
            onConfirm={
              amountMinor === null
                ? undefined
                : () => stage("amountMinor", amountMinor, currency)
            }
            onUndo={on("amountMinor") ? undo("amountMinor") : undefined}
            value={
              amountMinor === null
                ? "—"
                : formatMoneyMinor(amountMinor, currency)
            }
            {...shownStatus(on("amountMinor"), payload.amountMinor)}
          />
          <FieldReview
            disabled={disabled}
            editor={
              staged ? (
                <ChoiceEditor
                  initial={cadence ?? ""}
                  onStage={(value) => stage("cadence", value)}
                  render={(value, onChange) => (
                    <CadenceInput
                      label={cadenceFieldLabel(status)}
                      onChange={onChange}
                      value={value}
                    />
                  )}
                />
              ) : undefined
            }
            hasValue={cadence !== null}
            label={cadenceFieldLabel(status)}
            onConfirm={
              cadence === null ? undefined : () => stage("cadence", cadence)
            }
            onUndo={on("cadence") ? undo("cadence") : undefined}
            value={cadence === null ? "—" : cadenceLabel(cadence)}
            {...shownStatus(on("cadence"), payload.cadence)}
          />
          <FieldReview
            disabled={disabled}
            editor={
              staged ? (
                <ChoiceEditor
                  initial={nextRenewal ?? ""}
                  onStage={(value) => stage("nextRenewal", value)}
                  render={(value, onChange) => (
                    <DateInput
                      label="Next renewal"
                      onChange={onChange}
                      value={value}
                    />
                  )}
                />
              ) : undefined
            }
            hasValue={nextRenewal !== null}
            label="Next renewal"
            onConfirm={
              nextRenewal === null
                ? undefined
                : () => stage("nextRenewal", nextRenewal)
            }
            onUndo={on("nextRenewal") ? undo("nextRenewal") : undefined}
            value={formatDate(nextRenewal)}
            {...shownStatus(on("nextRenewal"), payload.nextRenewal)}
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
                payload.subscriptionStatus
                  ? statusLabel(payload.subscriptionStatus.value)
                  : "—"
              }
            />
          )}
          {trial || payload.trialEndsOn || staged ? (
            <FieldReview
              disabled={disabled}
              editor={
                staged ? (
                  <ChoiceEditor
                    initial={trialEndsOn ?? ""}
                    onStage={(value) => stage("trialEndsOn", value)}
                    render={(value, onChange) => (
                      <DateInput
                        label="Trial ends on"
                        onChange={onChange}
                        value={value}
                      />
                    )}
                  />
                ) : undefined
              }
              hasValue={trialEndsOn !== null}
              label="Trial ends on"
              onConfirm={
                trialEndsOn === null
                  ? undefined
                  : () => stage("trialEndsOn", trialEndsOn)
              }
              onUndo={on("trialEndsOn") ? undo("trialEndsOn") : undefined}
              value={formatDate(trialEndsOn)}
              {...shownStatus(on("trialEndsOn"), payload.trialEndsOn)}
            />
          ) : null}
          {trial || payload.autoRenewal || staged ? (
            <FieldReview
              disabled={disabled}
              editor={
                staged ? (
                  <ChoiceEditor
                    initial={autoRenewal ?? ""}
                    onStage={(value) => stage("autoRenewal", value)}
                    render={(value, onChange) => (
                      <AutoRenewalInput onChange={onChange} value={value} />
                    )}
                  />
                ) : undefined
              }
              hasValue={autoRenewal !== null}
              label="Auto-renewal"
              onConfirm={
                autoRenewal === null
                  ? undefined
                  : () => stage("autoRenewal", autoRenewal)
              }
              onUndo={on("autoRenewal") ? undo("autoRenewal") : undefined}
              value={autoRenewalLabel(autoRenewal)}
              {...shownStatus(on("autoRenewal"), payload.autoRenewal)}
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
        <p className="mt-4 text-sm text-amber-900">
          {payload.unsupportedStageOne.detail}
        </p>
      ) : null}
    </>
  );
}

/** Amount and currency staged together; the draft is prefilled, not yet staged. */
function AmountEditor({
  amountMinor,
  currency,
  onStage,
}: {
  amountMinor: number | null;
  currency: string;
  onStage: (minor: number, currency: string) => void;
}) {
  const close = useCloseEditor();
  const [amount, setAmount] = useState(
    amountMinor === null ? "" : toAmountInput(amountMinor),
  );
  const [code, setCode] = useState(currency);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = parseAmountInput(amount);

    if (!parsed.ok) {
      setError(parsed.message);

      return;
    }

    if (parsed.minor === null) {
      setError("Enter an amount, or cancel to leave it as proposed.");

      return;
    }

    onStage(parsed.minor, code);
    close();
  }

  return (
    <div>
      <AmountInput
        amount={amount}
        currency={code}
        onAmountChange={setAmount}
        onCurrencyChange={setCode}
      />
      {error ? (
        <p className="mt-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <InlineEditorActions
        onCancel={close}
        onSave={save}
        saveLabel="Use this value"
      />
    </div>
  );
}

/** A single-choice term: cadence, a date, or auto-renewal. Blank stages nothing. */
function ChoiceEditor<T extends string>({
  initial,
  onStage,
  render,
}: {
  initial: "" | T;
  onStage: (value: T) => void;
  render: (value: "" | T, onChange: (next: "" | T) => void) => ReactNode;
}) {
  const close = useCloseEditor();
  const [value, setValue] = useState<"" | T>(initial);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (value === "") {
      setError("Choose a value, or cancel to leave it as proposed.");

      return;
    }

    onStage(value);
    close();
  }

  return (
    <div>
      {render(value, setValue)}
      {error ? (
        <p className="mt-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <InlineEditorActions
        onCancel={close}
        onSave={save}
        saveLabel="Use this value"
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
          payload.subscriptionStatus
            ? statusLabel(payload.subscriptionStatus.value)
            : "—"
        }
      />
      <Field label="Ends" value={formatDate(payload.endsOn ?? null)} />
    </div>
  );
}

/** A payment is not a change of terms, so the card shows only what was paid. */
function ChargeFields({
  charge,
}: {
  charge: NonNullable<ProposalPayload["charge"]>;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field
        label="Paid"
        value={formatMoneyMinor(charge.amountMinor, charge.currency)}
      />
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
  onRetarget,
  onDiscuss,
  onStaged,
  selected = false,
}: {
  proposal: ProposalView;
  /** Any decision is in flight, so every button waits. */
  busy: boolean;
  /** This card is the one being decided. */
  working: boolean;
  /** Make the capture box about this card, so a correction lands on it. */
  onDiscuss?: (proposal: ProposalView) => void;
  /** The capture box is already about this card. */
  selected?: boolean;
  onDecide: (
    proposal: ProposalView,
    decision: Decision,
    confirm?: ConfirmedTerms,
  ) => void;
  /** Correcting the card's identity, or pointing it at an existing holding. */
  onRetarget?: (proposal: ProposalView, action: RetargetAction) => void;
  /** The terms set on the card so far changed; what they now are, before any accept. */
  onStaged?: (proposal: ProposalView, staged: ConfirmedTerms) => void;
}) {
  /** Exactly the terms the person has confirmed or set on this card so far. */
  const [staged, stage] = useState<ConfirmedTerms>({});
  const setStaged = (next: ConfirmedTerms) => {
    stage(next);
    onStaged?.(proposal, next);
  };
  const charge = proposal.payload?.charge ?? null;
  const ending = isLifecycleKind(proposal.kind);
  const cardStatus = proposal.payload ? reviewStatus(proposal.payload) : null;
  /** Editable on a card that can be applied; an ending's status is its point. */
  const editableStatus =
    cardStatus && proposal.appliable && !charge && !ending ? cardStatus : null;
  /** A restart is about the terms it comes back on, and the payment if there was one. */
  const restarting = proposal.kind === "reactivated";
  const reviewable = proposal.appliable && !charge && !ending;
  const confirm = toAcceptConfirm(staged, cardStatus);
  const summary = confirmSummary(confirm ?? {}, proposal.payload);

  function accept() {
    onDecide(proposal, "accept", confirm);
  }

  const statusControl = editableStatus ? (
    <StatusChoice
      disabled={busy}
      onChange={(status) =>
        setStaged(stageTerm(staged, "subscriptionStatus", status))
      }
      value={staged.subscriptionStatus ?? editableStatus}
    />
  ) : null;
  const stagedProps = reviewable
    ? { value: staged, onChange: setStaged }
    : undefined;

  return (
    <div
      className={
        selected
          ? "rounded-3xl border border-emerald-400 bg-white/80 p-6 ring-2 ring-emerald-200"
          : "rounded-3xl border border-stone-200 bg-white/80 p-6"
      }
    >
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            disabled={busy || !proposal.appliable || !proposal.payload}
            onClick={accept}
            type="button"
          >
            {working
              ? "Working…"
              : reviewable
                ? acceptLabel(summary.length)
                : "Accept"}
          </button>
          <button
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
            disabled={busy}
            onClick={() => onDecide(proposal, "reject")}
            type="button"
          >
            Reject
          </button>
          {onDiscuss ? (
            <button
              aria-pressed={selected}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-700"
              onClick={() => onDiscuss(proposal)}
              type="button"
            >
              {selected ? "Correcting this card" : "Correct in chat"}
            </button>
          ) : null}
        </div>
      </div>

      {proposal.payload ? (
        <>
          {restarting ? (
            <>
              <PayloadFields
                disabled={busy}
                payload={proposal.payload}
                staged={stagedProps}
                statusControl={statusControl}
              />
              {charge ? <ChargeFields charge={charge} /> : null}
            </>
          ) : charge ? (
            <ChargeFields charge={charge} />
          ) : ending ? (
            <LifecycleFields payload={proposal.payload} />
          ) : (
            <PayloadFields
              disabled={busy}
              payload={proposal.payload}
              staged={stagedProps}
              statusControl={statusControl}
            />
          )}
          {reviewable && summary.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-950">
              <p className="font-semibold">
                Accepting confirms exactly these values:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {summary.map((line) => (
                  <li key={line.field}>
                    {line.label}: {line.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {proposal.kind === "create" && proposal.appliable && onRetarget ? (
            <IdentityCorrection
              busy={busy}
              onRetarget={onRetarget}
              proposal={proposal}
            />
          ) : null}
          <p className="mt-4 text-xs text-stone-500">
            Accepting as proposed keeps every extracted term at the trust shown
            here; only fields you confirm or set are saved as confirmed.
            Accepting a reminder saves that preference. If this card cannot be
            edited enough, reject it and recapture, or edit the record by hand.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-red-800">
          This proposal&apos;s data no longer validates, so it can only be
          rejected.
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
