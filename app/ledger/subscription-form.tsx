"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { FieldStatusBadge } from "@/app/ledger/field-status-badge";
import {
  EMPTY_FORM_CONFIRM,
  isConfirmableField,
  needsTermsIntent,
  toCreateBody,
  toEditBody,
  type FormConfirm,
  type SubscriptionFormTrust,
  type SubscriptionFormValues,
  type TermsIntent,
} from "@/lib/subscriptions/form-values";
import {
  amountFieldLabel,
  autoRenewalLabel,
  cadenceFieldLabel,
  cadenceLabel,
  isTrialHolding,
  statusLabel,
} from "@/lib/subscriptions/format";
import { parseAmountInput } from "@/lib/subscriptions/money";
import { AUTO_RENEWALS, CADENCES, SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/params";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

type Target = { mode: "create" } | { mode: "edit"; id: string };

type IssueBody = { issues?: { field: string; message: string }[] };

function calendarToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function save(target: Target, body: unknown) {
  const response = await fetch(
    target.mode === "create" ? "/api/subscriptions" : `/api/subscriptions/${target.id}`,
    {
      method: target.mode === "create" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (response.status === 401) {
    throw new Error("Your session has expired. Sign in again to save this record.");
  }

  if (response.status === 404) {
    throw new Error("This record does not exist or belongs to a different account.");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as IssueBody;
    const issue = payload.issues?.[0];

    throw new Error(
      issue ? `${issue.field}: ${issue.message}` : "We couldn't save this record. Please try again.",
    );
  }

  return (await response.json()) as SubscriptionDetail;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold text-stone-800">
      {label}
      {children}
      {hint ? <span className="text-xs font-normal text-stone-500">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASS =
  "rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-normal text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

export function SubscriptionForm({
  target,
  initial,
  trust,
}: {
  target: Target;
  initial: SubscriptionFormValues;
  trust?: SubscriptionFormTrust;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [confirm, setConfirm] = useState<FormConfirm>(EMPTY_FORM_CONFIRM);
  const [termsIntent, setTermsIntent] = useState<TermsIntent | null>(null);
  const [termsEffectiveFrom, setTermsEffectiveFrom] = useState(calendarToday);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const initialAmount = parseAmountInput(initial.amount);
  const initialAmountMinor = initialAmount.ok ? initialAmount.minor : null;
  const parsedCurrentAmount = parseAmountInput(values.amount);
  const currentAmountMinor = parsedCurrentAmount.ok ? parsedCurrentAmount.minor : null;

  function update<K extends keyof SubscriptionFormValues>(
    key: K,
    value: SubscriptionFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateConfirm(key: keyof FormConfirm, value: boolean) {
    setConfirm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAmountError(null);

    const amount = parseAmountInput(values.amount);

    if (!amount.ok) {
      setAmountError(amount.message);
      return;
    }

    const payload =
      target.mode === "create"
        ? { ok: true as const, body: toCreateBody(values, amount.minor) }
        : toEditBody({
            initial,
            current: values,
            amountMinor: amount.minor,
            confirm,
            termsIntent,
            termsEffectiveFrom,
          });

    if (!payload.ok) {
      setError(payload.message);
      return;
    }

    setSaving(true);

    try {
      const saved = await save(target, payload.body);

      router.push(`/ledger/${saved.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save this record.");
      setSaving(false);
    }
  }

  const showAmountConfirm =
    target.mode === "edit" &&
    trust !== undefined &&
    isConfirmableField(trust.amount, initialAmountMinor !== null) &&
    currentAmountMinor === initialAmountMinor;
  const showCadenceConfirm =
    target.mode === "edit" &&
    trust !== undefined &&
    isConfirmableField(trust.cadence, initial.cadence !== "") &&
    values.cadence === initial.cadence;
  const showRenewalConfirm =
    target.mode === "edit" &&
    trust !== undefined &&
    isConfirmableField(trust.nextRenewal, initial.nextRenewal !== "") &&
    values.nextRenewal === initial.nextRenewal;
  const showTrialEndConfirm =
    target.mode === "edit" &&
    trust !== undefined &&
    isConfirmableField(trust.trialEndsOn, initial.trialEndsOn !== "") &&
    values.trialEndsOn === initial.trialEndsOn;
  const showAutoRenewalConfirm =
    target.mode === "edit" &&
    trust !== undefined &&
    isConfirmableField(trust.autoRenewal, initial.autoRenewal !== "") &&
    values.autoRenewal === initial.autoRenewal;
  const showTermsIntent =
    target.mode === "edit" &&
    needsTermsIntent(initial, values, initialAmountMinor, currentAmountMinor);
  const ending = target.mode === "edit" && values.status === "cancelled" && initial.status !== "cancelled";
  const scheduling =
    target.mode === "edit" &&
    values.status === "cancel_scheduled" &&
    initial.status !== "cancel_scheduled";
  const resuming =
    target.mode === "edit" &&
    initial.status === "cancelled" &&
    values.status !== "cancelled";

  return (
    <form className="mt-8 flex flex-col gap-6" onSubmit={onSubmit}>
      <section className="rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Identity</h2>
        <p className="mt-2 text-sm text-stone-600">
          A provider name is enough. Everything else can wait.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Provider">
            <input
              autoFocus
              className={INPUT_CLASS}
              maxLength={120}
              name="provider"
              onChange={(event) => update("provider", event.target.value)}
              placeholder="Netflix"
              required
              value={values.provider}
            />
          </Field>
          <Field label="Plan">
            <input
              className={INPUT_CLASS}
              maxLength={120}
              name="plan"
              onChange={(event) => update("plan", event.target.value)}
              placeholder="Standard"
              value={values.plan}
            />
          </Field>
          <Field label="Status">
            <select
              className={INPUT_CLASS}
              name="status"
              onChange={(event) =>
                update("status", event.target.value as SubscriptionFormValues["status"])
              }
              value={values.status}
            >
              {SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field hint="Which card or account pays for this" label="Account hint">
            <input
              className={INPUT_CLASS}
              maxLength={120}
              name="accountHint"
              onChange={(event) => update("accountHint", event.target.value)}
              placeholder="Personal Visa"
              value={values.accountHint}
            />
          </Field>
        </div>
        {ending ? (
          <p className="mt-4 text-sm text-stone-600">
            This ends the subscription the same way an accepted cancel proposal does: the row stays,
            the open terms close, and there is no next renewal. Set <span className="font-medium">Ends on</span>{" "}
            if you know the date; otherwise it is recorded as today.
          </p>
        ) : null}
        {scheduling ? (
          <p className="mt-4 text-sm text-stone-600">
            This schedules an ending and keeps billing until that date. Set{" "}
            <span className="font-medium">Ends on</span> to the last day it still bills.
          </p>
        ) : null}
        {resuming ? (
          <p className="mt-4 text-sm text-stone-600">
            This brings the same subscription back. Prior terms stay in history, and it resumes today
            unless you also change dates below.
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Terms</h2>
        <p className="mt-2 text-sm text-stone-600">
          {target.mode === "edit"
            ? "Changing a value records it as confirmed, because you are the authority on your own prices and dates. Fields you leave untouched keep their current trust. Saving the form is not confirmation."
            : "What you enter here is recorded as confirmed, because you are the authority on your own prices and dates. Leave a field blank to keep it unknown."}
        </p>
        {isTrialHolding(values.status) ? (
          <p className="mt-2 text-sm text-stone-600">
            A trial has no current charge. Amount and cadence here are the paid plan after trial.
            Trial end is when paid service would start if you continue, and is separate from
            subscription end.
          </p>
        ) : null}
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Field hint="Pounds, for example 9.99" label={amountFieldLabel(values.status)}>
              <input
                autoComplete="off"
                className={INPUT_CLASS}
                inputMode="decimal"
                name="amount"
                onChange={(event) => update("amount", event.target.value)}
                placeholder="9.99"
                value={values.amount}
              />
            </Field>
            {trust ? (
              <div className="flex flex-wrap items-center gap-2">
                <FieldStatusBadge status={trust.amount} />
                {showAmountConfirm ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <input
                      checked={confirm.amount}
                      className="h-4 w-4 accent-emerald-800"
                      name="confirmAmount"
                      onChange={(event) => updateConfirm("amount", event.target.checked)}
                      type="checkbox"
                    />
                    Confirm this amount
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Field
              hint={
                isTrialHolding(values.status)
                  ? "Paid-plan billing frequency after trial. This does not set auto-renewal."
                  : "How often it bills. This does not set auto-renewal."
              }
              label={cadenceFieldLabel(values.status)}
            >
              <select
                className={INPUT_CLASS}
                name="cadence"
                onChange={(event) =>
                  update("cadence", event.target.value as SubscriptionFormValues["cadence"])
                }
                value={values.cadence}
              >
                <option value="">Not known</option>
                {CADENCES.map((cadence) => (
                  <option key={cadence} value={cadence}>
                    {cadenceLabel(cadence)}
                  </option>
                ))}
              </select>
            </Field>
            {trust ? (
              <div className="flex flex-wrap items-center gap-2">
                <FieldStatusBadge status={trust.cadence} />
                {showCadenceConfirm ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <input
                      checked={confirm.cadence}
                      className="h-4 w-4 accent-emerald-800"
                      name="confirmCadence"
                      onChange={(event) => updateConfirm("cadence", event.target.checked)}
                      type="checkbox"
                    />
                    Confirm this cadence
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Field label="Next renewal">
              <input
                className={INPUT_CLASS}
                name="nextRenewal"
                onChange={(event) => update("nextRenewal", event.target.value)}
                type="date"
                value={values.nextRenewal}
              />
            </Field>
            {trust ? (
              <div className="flex flex-wrap items-center gap-2">
                <FieldStatusBadge status={trust.nextRenewal} />
                {showRenewalConfirm ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <input
                      checked={confirm.nextRenewal}
                      className="h-4 w-4 accent-emerald-800"
                      name="confirmNextRenewal"
                      onChange={(event) => updateConfirm("nextRenewal", event.target.checked)}
                      type="checkbox"
                    />
                    Confirm this date
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Field
              hint="When the free trial ends and paid service would start if you continue. Separate from Ends on."
              label="Trial ends on"
            >
              <input
                className={INPUT_CLASS}
                name="trialEndsOn"
                onChange={(event) => update("trialEndsOn", event.target.value)}
                type="date"
                value={values.trialEndsOn}
              />
            </Field>
            {trust ? (
              <div className="flex flex-wrap items-center gap-2">
                <FieldStatusBadge status={trust.trialEndsOn} />
                {showTrialEndConfirm ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <input
                      checked={confirm.trialEndsOn}
                      className="h-4 w-4 accent-emerald-800"
                      name="confirmTrialEndsOn"
                      onChange={(event) => updateConfirm("trialEndsOn", event.target.checked)}
                      type="checkbox"
                    />
                    Confirm this date
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Field
              hint="Whether the provider renews it automatically. Cadence does not decide this."
              label="Auto-renewal"
            >
              <select
                className={INPUT_CLASS}
                name="autoRenewal"
                onChange={(event) =>
                  update(
                    "autoRenewal",
                    event.target.value as SubscriptionFormValues["autoRenewal"],
                  )
                }
                value={values.autoRenewal}
              >
                <option value="">Unknown</option>
                {AUTO_RENEWALS.map((value) => (
                  <option key={value} value={value}>
                    {autoRenewalLabel(value)}
                  </option>
                ))}
              </select>
            </Field>
            {trust ? (
              <div className="flex flex-wrap items-center gap-2">
                <FieldStatusBadge status={trust.autoRenewal} />
                {showAutoRenewalConfirm ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <input
                      checked={confirm.autoRenewal}
                      className="h-4 w-4 accent-emerald-800"
                      name="confirmAutoRenewal"
                      onChange={(event) => updateConfirm("autoRenewal", event.target.checked)}
                      type="checkbox"
                    />
                    Confirm this
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          <Field label="Started on">
            <input
              className={INPUT_CLASS}
              name="startedOn"
              onChange={(event) => update("startedOn", event.target.value)}
              type="date"
              value={values.startedOn}
            />
          </Field>
          <Field
            hint={
              ending
                ? "The day it actually stopped. A past date is allowed."
                : "When a scheduled cancellation takes effect"
            }
            label="Ends on"
          >
            <input
              className={INPUT_CLASS}
              name="endsOn"
              onChange={(event) => update("endsOn", event.target.value)}
              type="date"
              value={values.endsOn}
            />
          </Field>
        </div>
        {showTermsIntent ? (
          <fieldset className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <legend className="text-sm font-semibold text-stone-900">
              Is this a correction or did the terms actually change?
            </legend>
            <p className="mt-2 text-sm text-stone-600">
              A correction fixes a wrong recorded value in place. A terms change keeps the prior
              price or plan in history and needs the day the new terms took effect.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex items-start gap-2 text-sm font-medium text-stone-800">
                <input
                  checked={termsIntent === "correction"}
                  className="mt-1 h-4 w-4 accent-emerald-800"
                  name="termsIntent"
                  onChange={() => setTermsIntent("correction")}
                  type="radio"
                  value="correction"
                />
                <span>
                  Correction — this value was recorded wrongly
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm font-medium text-stone-800">
                <input
                  checked={termsIntent === "terms_change"}
                  className="mt-1 h-4 w-4 accent-emerald-800"
                  name="termsIntent"
                  onChange={() => setTermsIntent("terms_change")}
                  type="radio"
                  value="terms_change"
                />
                <span>The price or plan actually changed</span>
              </label>
            </div>
            {termsIntent === "terms_change" ? (
              <div className="mt-4 max-w-xs">
                <Field hint="The day the new terms started" label="Effective from">
                  <input
                    className={INPUT_CLASS}
                    name="termsEffectiveFrom"
                    onChange={(event) => setTermsEffectiveFrom(event.target.value)}
                    required
                    type="date"
                    value={termsEffectiveFrom}
                  />
                </Field>
              </div>
            ) : null}
          </fieldset>
        ) : null}
        {amountError ? (
          <p aria-live="polite" className="mt-4 text-sm font-medium text-red-700">
            {amountError}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Notes</h2>
        <textarea
          className={`mt-4 w-full ${INPUT_CLASS}`}
          maxLength={2000}
          name="notes"
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Anything you want to remember about this subscription"
          rows={4}
          value={values.notes}
        />
      </section>

      {error ? (
        <p aria-live="polite" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-xl bg-emerald-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving…" : target.mode === "create" ? "Save subscription" : "Save changes"}
        </button>
        <button
          className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
          disabled={saving}
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
