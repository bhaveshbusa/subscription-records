"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cadenceLabel, statusLabel } from "@/lib/subscriptions/format";
import { parseAmountInput, toAmountInput } from "@/lib/subscriptions/money";
import { CADENCES, SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/params";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

export type SubscriptionFormValues = {
  provider: string;
  plan: string;
  accountHint: string;
  status: (typeof SUBSCRIPTION_STATUSES)[number];
  amount: string;
  cadence: "" | (typeof CADENCES)[number];
  nextRenewal: string;
  startedOn: string;
  endsOn: string;
  notes: string;
};

export const EMPTY_SUBSCRIPTION_FORM: SubscriptionFormValues = {
  provider: "",
  plan: "",
  accountHint: "",
  status: "active",
  amount: "",
  cadence: "",
  nextRenewal: "",
  startedOn: "",
  endsOn: "",
  notes: "",
};

export function toSubscriptionFormValues(
  subscription: SubscriptionDetail,
): SubscriptionFormValues {
  return {
    provider: subscription.provider.value ?? "",
    plan: subscription.plan.value ?? "",
    accountHint: subscription.accountHint ?? "",
    status: subscription.status.value ?? "unknown",
    amount: toAmountInput(subscription.amount.value?.minor ?? null),
    cadence: subscription.cadence.value ?? "",
    nextRenewal: subscription.nextRenewal.value ?? "",
    startedOn: subscription.startedOn ?? "",
    endsOn: subscription.endsOn ?? "",
    notes: subscription.notes ?? "",
  };
}

type Target = { mode: "create" } | { mode: "edit"; id: string };

type IssueBody = { issues?: { field: string; message: string }[] };

function textOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

async function save(target: Target, values: SubscriptionFormValues, amountMinor: number | null) {
  const body = {
    provider: values.provider.trim(),
    plan: textOrNull(values.plan),
    accountHint: textOrNull(values.accountHint),
    status: values.status,
    amountMinor,
    cadence: values.cadence === "" ? null : values.cadence,
    nextRenewal: textOrNull(values.nextRenewal),
    startedOn: textOrNull(values.startedOn),
    endsOn: textOrNull(values.endsOn),
    notes: textOrNull(values.notes),
  };

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
}: {
  target: Target;
  initial: SubscriptionFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof SubscriptionFormValues>(
    key: K,
    value: SubscriptionFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
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

    setSaving(true);

    try {
      const saved = await save(target, values, amount.minor);

      router.push(`/ledger/${saved.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save this record.");
      setSaving(false);
    }
  }

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
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Terms</h2>
        <p className="mt-2 text-sm text-stone-600">
          What you enter here is recorded as confirmed, because you are the authority on your
          own prices and dates. Leave a field blank to keep it unknown.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field hint="Pounds, for example 9.99" label="Amount (GBP)">
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
          <Field label="Cadence">
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
          <Field label="Next renewal">
            <input
              className={INPUT_CLASS}
              name="nextRenewal"
              onChange={(event) => update("nextRenewal", event.target.value)}
              type="date"
              value={values.nextRenewal}
            />
          </Field>
          <Field label="Started on">
            <input
              className={INPUT_CLASS}
              name="startedOn"
              onChange={(event) => update("startedOn", event.target.value)}
              type="date"
              value={values.startedOn}
            />
          </Field>
          <Field hint="When a scheduled cancellation takes effect" label="Ends on">
            <input
              className={INPUT_CLASS}
              name="endsOn"
              onChange={(event) => update("endsOn", event.target.value)}
              type="date"
              value={values.endsOn}
            />
          </Field>
        </div>
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
