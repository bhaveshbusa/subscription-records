"use client";

import { useState, type ReactNode } from "react";

import {
  AmountInput,
  AutoRenewalInput,
  CadenceInput,
  DateInput,
  FieldReview,
  InlineEditorActions,
  TextInput,
  useCloseEditor,
} from "@/components/fields/field-review";
import { calendarToday } from "@/lib/subscriptions/dates";
import {
  canRecordTermsChange,
  EMPTY_FORM_CONFIRM,
  needsTermsIntent,
  termsEdits,
  toEditBody,
  toSubscriptionFormValues,
  type FormConfirm,
  type SubscriptionFormValues,
  type SubscriptionWriteBody,
  type TermsIntent,
} from "@/lib/subscriptions/form-values";
import {
  amountFieldLabel,
  autoRenewalLabel,
  cadenceFieldLabel,
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
} from "@/lib/subscriptions/format";
import { parseAmountInput } from "@/lib/subscriptions/money";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

import { saveSubscription } from "./save-subscription";
import { TermsChangeOffer, TermsIntentChoice } from "./terms-intent";

type Update = <K extends keyof SubscriptionFormValues>(
  key: K,
  value: SubscriptionFormValues[K],
) => void;

/**
 * One field's editor over the whole record as form values, so the same
 * `toEditBody` that backs the full form decides what a save sends: only what
 * this editor changed, with the correction-or-terms-change question when a
 * recorded price, cadence, or plan is replaced. A failed save keeps the draft.
 */
function RecordEditor({
  values,
  name,
  save,
  render,
}: {
  values: SubscriptionFormValues;
  name: string;
  save: (body: SubscriptionWriteBody) => Promise<string | null>;
  render: (draft: SubscriptionFormValues, update: Update) => ReactNode;
}) {
  const close = useCloseEditor();
  const [draft, setDraft] = useState(values);
  const [termsIntent, setTermsIntent] = useState<TermsIntent | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(calendarToday);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update: Update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const initialMinor = parseAmountInput(values.amount);
  const initialAmountMinor = initialMinor.ok ? initialMinor.minor : null;
  const draftMinor = parseAmountInput(draft.amount);
  const amountMinor = draftMinor.ok ? draftMinor.minor : null;
  const edits = termsEdits(values, draft, initialAmountMinor, amountMinor);
  const askIntent = needsTermsIntent(
    values,
    draft,
    initialAmountMinor,
    amountMinor,
  );
  const offerChange =
    !askIntent &&
    canRecordTermsChange(values, draft, initialAmountMinor, amountMinor);

  async function onSave() {
    setError(null);

    if (!draftMinor.ok) {
      setError(draftMinor.message);

      return;
    }

    const result = toEditBody({
      initial: values,
      current: draft,
      amountMinor: draftMinor.minor,
      termsIntent,
      termsEffectiveFrom: effectiveFrom,
    });

    if (!result.ok) {
      setError(result.message);

      return;
    }

    if (Object.keys(result.body).length === 0) {
      close();

      return;
    }

    setSaving(true);

    const failure = await save(result.body);

    setSaving(false);

    if (failure) {
      setError(failure);

      return;
    }

    close();
  }

  return (
    <div>
      {render(draft, update)}
      {askIntent ? (
        <TermsIntentChoice
          currency={draft.currency}
          edits={edits}
          effectiveFrom={effectiveFrom}
          intent={termsIntent}
          name={`${name}Intent`}
          onEffectiveFromChange={setEffectiveFrom}
          onIntentChange={setTermsIntent}
        />
      ) : null}
      {offerChange ? (
        <TermsChangeOffer
          currency={draft.currency}
          edits={edits}
          effectiveFrom={effectiveFrom}
          intent={termsIntent}
          name={`${name}Changed`}
          onEffectiveFromChange={setEffectiveFrom}
          onIntentChange={setTermsIntent}
        />
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <InlineEditorActions onCancel={close} onSave={onSave} saving={saving} />
    </div>
  );
}

/**
 * The record's terms and details with a Confirm, Edit, or Add on each field.
 * Confirming sends exactly that field, unchanged; editing sends only what the
 * editor changed. Status and the lifecycle dates stay on the full edit page,
 * because ending or restarting a holding is a dated action, not a field.
 */
export function RecordTerms({
  initial,
  onSaved,
}: {
  initial: SubscriptionDetail;
  /** A write here changes the row, the work queue, and the coverage figures. */
  onSaved?: (detail: SubscriptionDetail) => void;
}) {
  const [detail, setDetail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirmErrors, setConfirmErrors] = useState<
    Partial<Record<keyof FormConfirm, string>>
  >({});
  const values = toSubscriptionFormValues(detail);
  const status = detail.status.value;
  const amountMinor = detail.amount.value?.minor ?? null;

  async function save(body: SubscriptionWriteBody): Promise<string | null> {
    setBusy(true);

    try {
      const next = await saveSubscription(
        { mode: "edit", id: detail.id },
        body,
      );

      setDetail(next);
      onSaved?.(next);

      return null;
    } catch (caught) {
      return caught instanceof Error
        ? caught.message
        : "We couldn't save this record. Please try again.";
    } finally {
      setBusy(false);
    }
  }

  async function confirmField(field: keyof FormConfirm) {
    const result = toEditBody({
      initial: values,
      current: values,
      amountMinor,
      confirm: { ...EMPTY_FORM_CONFIRM, [field]: true },
    });

    if (!result.ok) {
      setConfirmErrors((current) => ({ ...current, [field]: result.message }));

      return;
    }

    const failure = await save(result.body);

    setConfirmErrors((current) => ({
      ...current,
      [field]: failure ?? undefined,
    }));
  }

  const editor = (
    name: string,
    render: (draft: SubscriptionFormValues, update: Update) => ReactNode,
  ) => <RecordEditor name={name} render={render} save={save} values={values} />;

  return (
    <>
      <section className="rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Current terms</h2>
        <p className="mt-2 text-sm text-stone-600">
          Confirm, Edit, or Add saves only that field; everything else keeps its value
          and trust.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <FieldReview
            disabled={busy}
            editor={editor("provider", (draft, update) => (
              <TextInput
                label="Provider"
                onChange={(value) => update("provider", value)}
                value={draft.provider}
              />
            ))}
            error={confirmErrors.provider}
            hasValue={detail.provider.value !== null}
            label="Provider"
            onConfirm={() => confirmField("provider")}
            status={detail.provider.status}
            value={detail.provider.value ?? "—"}
          />
          <FieldReview
            disabled={busy}
            editor={editor("plan", (draft, update) => (
              <TextInput
                label="Plan"
                onChange={(value) => update("plan", value)}
                value={draft.plan}
              />
            ))}
            hasValue={detail.plan.value !== null}
            label="Plan"
            status={null}
            value={detail.plan.value ?? "—"}
          />
          <FieldReview
            hasValue={status !== null}
            label="Status"
            note="Change status, or end or restart this subscription, on the full edit page."
            status={detail.status.status}
            value={statusLabel(status)}
          />
          <FieldReview
            disabled={busy}
            editor={editor("amount", (draft, update) => (
              <AmountInput
                amount={draft.amount}
                currency={draft.currency}
                onAmountChange={(value) => update("amount", value)}
                onCurrencyChange={(value) => update("currency", value)}
              />
            ))}
            error={confirmErrors.amount}
            hasValue={amountMinor !== null}
            label={amountFieldLabel(status)}
            onConfirm={() => confirmField("amount")}
            status={detail.amount.status}
            value={
              detail.amount.value
                ? formatMoneyMinor(
                    detail.amount.value.minor,
                    detail.amount.value.currency,
                  )
                : "—"
            }
          />
          <FieldReview
            disabled={busy}
            editor={editor("cadence", (draft, update) => (
              <CadenceInput
                label={cadenceFieldLabel(status)}
                onChange={(value) => update("cadence", value)}
                value={draft.cadence}
              />
            ))}
            error={confirmErrors.cadence}
            hasValue={detail.cadence.value !== null}
            label={cadenceFieldLabel(status)}
            onConfirm={() => confirmField("cadence")}
            status={detail.cadence.status}
            value={cadenceLabel(detail.cadence.value)}
          />
          <FieldReview
            disabled={busy}
            editor={editor("nextRenewal", (draft, update) => (
              <DateInput
                label="Next renewal"
                onChange={(value) => update("nextRenewal", value)}
                value={draft.nextRenewal}
              />
            ))}
            error={confirmErrors.nextRenewal}
            hasValue={detail.nextRenewal.value !== null}
            label="Next renewal"
            onConfirm={() => confirmField("nextRenewal")}
            status={detail.nextRenewal.status}
            value={formatDate(detail.nextRenewal.value)}
          />
          {detail.expectedNextRenewal ? (
            <FieldReview
              hasValue
              label="Expected next renewal"
              status={detail.expectedNextRenewal.status}
              value={`${formatDate(detail.expectedNextRenewal.value)} (inferred / expected)`}
            />
          ) : null}
          <FieldReview
            disabled={busy}
            editor={editor("trialEndsOn", (draft, update) => (
              <DateInput
                label="Trial ends on"
                onChange={(value) => update("trialEndsOn", value)}
                value={draft.trialEndsOn}
              />
            ))}
            error={confirmErrors.trialEndsOn}
            hasValue={detail.trialEndsOn.value !== null}
            label="Trial ends on"
            onConfirm={() => confirmField("trialEndsOn")}
            status={detail.trialEndsOn.status}
            value={formatDate(detail.trialEndsOn.value)}
          />
          <FieldReview
            disabled={busy}
            editor={editor("autoRenewal", (draft, update) => (
              <AutoRenewalInput
                onChange={(value) => update("autoRenewal", value)}
                value={draft.autoRenewal}
              />
            ))}
            error={confirmErrors.autoRenewal}
            hasValue={detail.autoRenewal.value !== null}
            label="Auto-renewal"
            onConfirm={() => confirmField("autoRenewal")}
            status={detail.autoRenewal.status}
            value={autoRenewalLabel(detail.autoRenewal.value)}
          />
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Details</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <FieldReview
            disabled={busy}
            editor={editor("accountHint", (draft, update) => (
              <TextInput
                label="Account hint"
                onChange={(value) => update("accountHint", value)}
                value={draft.accountHint}
              />
            ))}
            hasValue={detail.accountHint !== null}
            label="Account hint"
            status={null}
            value={detail.accountHint ?? "—"}
          />
          <FieldReview
            hasValue={detail.startedOn !== null}
            label="Started on"
            status={null}
            value={formatDate(detail.startedOn)}
          />
          <FieldReview
            hasValue={detail.endsOn !== null}
            label="Ends on"
            status={null}
            value={formatDate(detail.endsOn)}
          />
          <FieldReview
            disabled={busy}
            editor={editor("notes", (draft, update) => (
              <TextInput
                label="Notes"
                multiline
                onChange={(value) => update("notes", value)}
                value={draft.notes}
              />
            ))}
            hasValue={detail.notes !== null}
            label="Notes"
            status={null}
            value={detail.notes ?? "—"}
          />
        </div>
      </section>
    </>
  );
}
