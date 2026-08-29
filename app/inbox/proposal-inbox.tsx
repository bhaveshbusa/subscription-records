"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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

type Decision = "accept" | "reject";

type Outcome = {
  decision: Decision;
  provider: string;
  subscriptionId: string | null;
  conflicts: ProposalConflict[];
};

const KIND_LABEL: Record<ProposalKind, string> = {
  create: "New subscription",
  update: "Update",
  charged: "Charge",
  terms_changed: "Terms changed",
  cancel_scheduled: "Cancel scheduled",
  cancelled: "Cancelled",
  reactivated: "Reactivated",
  lapsed: "Lapsed",
};

const CONFLICT_LABEL: Record<ProposalConflict, string> = {
  provider: "provider",
  status: "status",
  amount: "amount",
  cadence: "cadence",
  nextRenewal: "next renewal",
};

function proposalTitle(proposal: ProposalView) {
  return (
    proposal.payload?.provider?.value ?? proposal.subscriptionProvider ?? "Unknown provider"
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
        status={
          payload.amountMinor ? fieldStatusLabel(payload.amountMinor.status) : "Missing"
        }
        value={
          payload.amountMinor
            ? formatMoneyMinor(payload.amountMinor.value, currency)
            : "—"
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
        value={
          payload.subscriptionStatus ? statusLabel(payload.subscriptionStatus.value) : "—"
        }
      />
    </div>
  );
}

export function ProposalInbox() {
  const [items, setItems] = useState<ProposalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setListError(null);

      try {
        const response = await fetch("/api/proposals?state=pending", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Sign in again to view your inbox."
              : "We couldn't load your inbox. Please try again.",
          );
        }

        const payload = (await response.json()) as { items?: ProposalView[] };

        setItems(payload.items ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setListError(error instanceof Error ? error.message : "We couldn't load your inbox.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [attempt]);

  const decide = useCallback(async (proposal: ProposalView, decision: Decision) => {
    setPending(proposal.id);
    setDecideError(null);

    try {
      const response = await fetch(`/api/proposals/${proposal.id}/${decision}`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        subscriptionId?: string | null;
        conflicts?: ProposalConflict[];
      };

      if (!response.ok) {
        throw new Error(
          payload.error === "not_pending"
            ? "That proposal was already decided. Reloading the inbox."
            : `We couldn't ${decision} that proposal. Please try again.`,
        );
      }

      setItems((current) => current.filter((item) => item.id !== proposal.id));
      setOutcomes((current) => [
        {
          decision,
          provider: proposalTitle(proposal),
          subscriptionId: payload.subscriptionId ?? null,
          conflicts: payload.conflicts ?? [],
        },
        ...current,
      ]);
    } catch (error) {
      setDecideError(error instanceof Error ? error.message : "That decision didn't go through.");
      setAttempt((value) => value + 1);
    } finally {
      setPending(null);
    }
  }, []);

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl">
      {outcomes.map((outcome, index) => (
        <div
          className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          key={`${outcome.provider}-${index}`}
        >
          {outcome.decision === "accept" ? (
            <p>
              {outcome.provider} is now in your ledger with proposed amounts.{" "}
              {outcome.subscriptionId ? (
                <Link className="font-semibold underline" href={`/ledger/${outcome.subscriptionId}`}>
                  Review it
                </Link>
              ) : null}
            </p>
          ) : (
            <p>{outcome.provider} was rejected. Nothing was written to your ledger.</p>
          )}
          {outcome.conflicts.length > 0 ? (
            <p className="mt-1 text-xs">
              Kept your confirmed {outcome.conflicts.map((c) => CONFLICT_LABEL[c]).join(", ")} and
              flagged the field as conflicted.
            </p>
          ) : null}
        </div>
      ))}

      {decideError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decideError}
        </div>
      ) : null}

      <div aria-busy={loading} aria-label="Pending proposals" role="region">
        {loading ? (
          <div className="rounded-3xl border border-stone-200 bg-white/70 px-6 py-14 text-center text-sm text-stone-600">
            Loading…
          </div>
        ) : listError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="text-sm text-red-800">{listError}</p>
            <button
              className="mt-4 rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              onClick={() => setAttempt((value) => value + 1)}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-lg font-medium text-stone-800">Nothing waiting for you.</p>
            <p className="mt-2 text-sm text-stone-500">
              Proposals appear here before they can touch your ledger.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((proposal) => (
              <li
                className="rounded-3xl border border-stone-200 bg-white/80 p-6"
                key={proposal.id}
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
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                      disabled={pending !== null || !proposal.appliable || !proposal.payload}
                      onClick={() => void decide(proposal, "accept")}
                      type="button"
                    >
                      {pending === proposal.id ? "Working…" : "Accept"}
                    </button>
                    <button
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
                      disabled={pending !== null}
                      onClick={() => void decide(proposal, "reject")}
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
