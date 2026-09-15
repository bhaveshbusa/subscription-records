"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  AmountInput,
  AutoRenewalInput,
  CadenceInput,
  DateInput,
  FieldGroup,
  FieldReview,
  InlineEditorActions,
  TextInput,
  useCloseEditor,
} from "@/components/fields/field-review";
import { Disclosure, Feedback } from "@/components/ui/foundations";
import {
  EXPECTED_DATE_NOTE,
  NONE_RECORDED,
} from "@/lib/fields/review";
import type { DifferenceField } from "@/lib/proposals/differences";
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
import { StatusFieldEditor } from "./status-field-editor";
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
            {error ? <Feedback tone="error">{error}</Feedback> : null}
      <InlineEditorActions onCancel={close} onSave={onSave} saving={saving} />
    </div>
  );
}

/**
 * The record's terms and details with a Confirm, Edit, or Add on each field.
 * Confirming sends exactly that field, unchanged; editing sends only what the
 * editor changed. Status edits inline: ordinary corrections are status-only;
 * cancel / schedule / reactivate expand timing through the shared writers.
 */
export function RecordTerms({
  initial,
  onSaved,
  afterField,
  heading = "Saved terms",
}: {
  initial: SubscriptionDetail;
  /** A write here changes the row, the work queue, and the coverage figures. */
  onSaved?: (detail: SubscriptionDetail) => void;
  /** Independently addressable pending cards that sit next to the named field. */
  afterField?: Partial<Record<DifferenceField, ReactNode>>;
  heading?: string;
}) {
  const [detail, setDetail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<keyof FormConfirm | null>(null);
  const [confirmErrors, setConfirmErrors] = useState<
    Partial<Record<keyof FormConfirm, string>>
  >({});
  const [confirmSuccess, setConfirmSuccess] = useState<
    Partial<Record<keyof FormConfirm, string>>
  >({});
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
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

  async function confirmField(field: keyof FormConfirm, successLabel: string) {
    setConfirming(field);
    setConfirmSuccess((current) => ({ ...current, [field]: undefined }));

    const result = toEditBody({
      initial: values,
      current: values,
      amountMinor,
      confirm: { ...EMPTY_FORM_CONFIRM, [field]: true },
    });

    if (!result.ok) {
      setConfirmErrors((current) => ({ ...current, [field]: result.message }));
      setConfirming(null);

      return;
    }

    const failure = await save(result.body);

    setConfirmErrors((current) => ({
      ...current,
      [field]: failure ?? undefined,
    }));
    setConfirmSuccess((current) => ({
      ...current,
      [field]: failure ? undefined : `${successLabel} confirmed.`,
    }));
    setConfirming(null);
  }

  const editor = (
    name: string,
    render: (draft: SubscriptionFormValues, update: Update) => ReactNode,
  ) => <RecordEditor name={name} render={render} save={save} values={values} />;

  return (
    <>
      <section className="rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">{heading}</h2>
        <p className="mt-2 text-sm text-stone-600">
          Confirm, Edit, or Add saves only that field; everything else keeps its value
          and trust. Pending changes stay labelled until you accept them.
        </p>
        <div className="ui-field-list mt-6">
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
            onConfirm={() => confirmField("provider", "Provider")}
            saving={confirming === "provider"}
            status={detail.provider.status}
            success={confirmSuccess.provider}
            value={detail.provider.value ?? "—"}
          />
          {afterField?.provider}
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
          {afterField?.plan}
          <FieldReview
            disabled={busy}
            editor={
              <StatusFieldEditor
                initialNotes={values.notes}
                initialStatus={values.status}
                onSuccess={setStatusSuccess}
                save={save}
              />
            }
            hasValue={status !== null}
            label="Status"
            note={
              <>
                Ordinary status changes save status only. Ending or restarting asks
                for timing here. Full form remains available via{" "}
                <Link className="font-semibold underline" href={`/ledger/${detail.id}/edit`}>
                  Edit everything
                </Link>
                .
              </>
            }
            status={detail.status.status}
            success={statusSuccess}
            value={statusLabel(status)}
          />
          {afterField?.status}
          <FieldGroup label="Price and cadence">
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
              onConfirm={() => confirmField("amount", amountFieldLabel(status))}
              saving={confirming === "amount"}
              status={detail.amount.status}
              success={confirmSuccess.amount}
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
              onConfirm={() => confirmField("cadence", cadenceFieldLabel(status))}
              saving={confirming === "cadence"}
              status={detail.cadence.status}
              success={confirmSuccess.cadence}
              value={cadenceLabel(detail.cadence.value)}
            />
          </FieldGroup>
          {afterField?.amount}
          {afterField?.cadence}
          <FieldReview
            disabled={busy}
            editor={editor("nextRenewal", (draft, update) => (
              <DateInput
                label="Recorded renewal"
                onChange={(value) => update("nextRenewal", value)}
                value={draft.nextRenewal}
              />
            ))}
            error={confirmErrors.nextRenewal}
            hasValue={detail.nextRenewal.value !== null}
            label="Recorded renewal"
            onConfirm={() => confirmField("nextRenewal", "Recorded renewal")}
            saving={confirming === "nextRenewal"}
            status={detail.nextRenewal.status}
            success={confirmSuccess.nextRenewal}
            value={formatDate(detail.nextRenewal.value)}
          />
          {afterField?.nextRenewal}
          {detail.expectedNextRenewal ? (
            <FieldReview
              hasValue
              label="Expected next renewal"
              note={EXPECTED_DATE_NOTE}
              readOnly
              status={detail.expectedNextRenewal.status}
              value={formatDate(detail.expectedNextRenewal.value)}
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
            onConfirm={() => confirmField("trialEndsOn", "Trial ends on")}
            saving={confirming === "trialEndsOn"}
            status={detail.trialEndsOn.status}
            success={confirmSuccess.trialEndsOn}
            value={formatDate(detail.trialEndsOn.value)}
          />
          {afterField?.trialEndsOn}
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
            onConfirm={() => confirmField("autoRenewal", "Auto-renewal")}
            saving={confirming === "autoRenewal"}
            status={detail.autoRenewal.status}
            success={confirmSuccess.autoRenewal}
            value={autoRenewalLabel(detail.autoRenewal.value)}
          />
          {afterField?.autoRenewal}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <Disclosure label="Notes, dates and supporting details">
          <div className="ui-field-list mt-4">
            <FieldReview
              disabled={busy}
              editor={editor("accountHint", (draft, update) => (
                <TextInput
                  label="Account hint"
                  onChange={(value) => update("accountHint", value)}
                  value={draft.accountHint}
                />
              ))}
              emptyCopy={NONE_RECORDED}
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
              emptyCopy={NONE_RECORDED}
              hasValue={detail.notes !== null}
              label="Notes"
              status={null}
              value={detail.notes ?? "—"}
            />
          </div>
        </Disclosure>
      </section>
    </>
  );
}
