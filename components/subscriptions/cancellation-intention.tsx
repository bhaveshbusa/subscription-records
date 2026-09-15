"use client";

import { useId, useState } from "react";

import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/components/fields/field-review";
import { saveSubscription } from "@/components/subscriptions/save-subscription";
import { Button, Feedback, Surface } from "@/components/ui/foundations";
import { intentionIsDue, intentionRowHint } from "@/lib/cancellation-intention/copy";
import { calendarToday } from "@/lib/subscriptions/dates";
import { appendNotes } from "@/lib/subscriptions/status-edit";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

type Mode = "view" | "change-date" | "report-cancelled";

/**
 * Planned cancellation intention on the open row (SUB-64). Not status and not
 * renewal/trial reminder preferences. Soft before remind_on; prominent from
 * that date. Change date / Keep / I cancelled are the only resolvers.
 */
export function CancellationIntentionBlock({
  detail,
  onSaved,
}: {
  detail: SubscriptionDetail;
  onSaved: (next: SubscriptionDetail) => void;
}) {
  const today = calendarToday();
  const intention = detail.cancellationIntention;
  const [mode, setMode] = useState<Mode>("view");
  const [remindOn, setRemindOn] = useState(intention?.remindOn ?? "");
  const [endsOn, setEndsOn] = useState("");
  const [unknownTiming, setUnknownTiming] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dateId = useId();
  const endsId = useId();
  const notesId = useId();

  const due = intention ? intentionIsDue(intention, today) : false;

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const next = await saveSubscription({ mode: "edit", id: detail.id }, body);
      onSaved(next);
      setMode("view");
      setMessage(success);
      setRemindOn(next.cancellationIntention?.remindOn ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!intention) {
    return (
      <Surface className="flex flex-col gap-3 bg-ui-soft p-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Cancel plan</h3>
          <p className="mt-1 text-sm text-stone-500">
            Want to cancel later with the provider? Set a remind date. This does not cancel the
            subscription.
          </p>
        </div>
        {mode === "change-date" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!remindOn) {
                setError("Choose a remind date.");
                return;
              }
              void patch(
                { cancellationIntention: { remindOn } },
                "Cancel plan saved. Status is unchanged.",
              );
            }}
          >
            <label className={FIELD_LABEL_CLASS} htmlFor={dateId}>
              Remind me on
            </label>
            <input
              className={FIELD_INPUT_CLASS}
              id={dateId}
              onChange={(event) => setRemindOn(event.target.value)}
              required
              type="date"
              value={remindOn}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} type="submit">
                Save plan
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setMode("view");
                  setError(null);
                }}
                type="button"
                variant="quiet"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            onClick={() => {
              setMode("change-date");
              setRemindOn(today);
              setMessage(null);
            }}
            type="button"
            variant="quiet"
          >
            Plan to cancel
          </Button>
        )}
        {error ? <Feedback tone="error">{error}</Feedback> : null}
        {message ? <Feedback tone="success">{message}</Feedback> : null}
      </Surface>
    );
  }

  return (
    <Surface
      className={`flex flex-col gap-3 bg-ui-soft p-4 ${due ? "ring-1 ring-amber-300/80" : ""}`}
    >
      <div>
        <h3 className="text-sm font-semibold text-stone-800">Cancel plan</h3>
        <p className={`mt-1 text-sm ${due ? "font-medium text-stone-800" : "text-stone-500"}`}>
          {intentionRowHint(intention, today)}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Not cancelled yet — cancel with the provider, then report it here. Opening this page does
          not clear the plan.
        </p>
      </div>

      {mode === "change-date" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!remindOn) {
              setError("Choose a remind date.");
              return;
            }
            void patch(
              { cancellationIntention: { remindOn } },
              "Remind date updated. The plan stays open.",
            );
          }}
        >
          <label className={FIELD_LABEL_CLASS} htmlFor={dateId}>
            Remind me on
          </label>
          <input
            className={FIELD_INPUT_CLASS}
            id={dateId}
            onChange={(event) => setRemindOn(event.target.value)}
            required
            type="date"
            value={remindOn}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="submit">
              Save date
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setMode("view");
                setRemindOn(intention.remindOn);
                setError(null);
              }}
              type="button"
              variant="quiet"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "report-cancelled" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (unknownTiming) {
              const nextNotes = appendNotes(detail.notes ?? "", notes);

              if (nextNotes === (detail.notes ?? null) || nextNotes === null) {
                setError("Add a note, or enter when it ended.");
                return;
              }

              void patch(
                { notes: nextNotes },
                "Note saved. Status and cancel plan stay until you add when it ended.",
              );
              return;
            }

            if (!endsOn) {
              setError("Enter the end date, or mark timing unknown.");
              return;
            }

            const nextNotes = appendNotes(detail.notes ?? "", notes);
            void patch(
              {
                status: "cancelled",
                endsOn,
                ...(nextNotes !== (detail.notes ?? null) ? { notes: nextNotes } : {}),
              },
              "Recorded as cancelled. Cancel plan cleared.",
            );
          }}
        >
          <label className={FIELD_LABEL_CLASS} htmlFor={endsId}>
            Ended on
          </label>
          <input
            className={FIELD_INPUT_CLASS}
            disabled={unknownTiming}
            id={endsId}
            onChange={(event) => setEndsOn(event.target.value)}
            type="date"
            value={endsOn}
          />
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              checked={unknownTiming}
              onChange={(event) => setUnknownTiming(event.target.checked)}
              type="checkbox"
            />
            Timing unknown — leave status and plan, save a note
          </label>
          <label className={FIELD_LABEL_CLASS} htmlFor={notesId}>
            Notes
          </label>
          <textarea
            className={FIELD_INPUT_CLASS}
            id={notesId}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            value={notes}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="submit">
              Save
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setMode("view");
                setError(null);
              }}
              type="button"
              variant="quiet"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "view" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => {
              setMode("change-date");
              setRemindOn(intention.remindOn);
              setMessage(null);
            }}
            type="button"
            variant="quiet"
          >
            Change date
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void patch(
                { cancellationIntention: null },
                "Kept the subscription. Cancel plan cleared.",
              )
            }
            type="button"
            variant="quiet"
          >
            Keep subscription
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setMode("report-cancelled");
              setEndsOn(today);
              setUnknownTiming(false);
              setNotes("");
              setMessage(null);
            }}
            type="button"
          >
            I cancelled
          </Button>
        </div>
      ) : null}

      {error ? <Feedback tone="error">{error}</Feedback> : null}
      {message ? <Feedback tone="success">{message}</Feedback> : null}
    </Surface>
  );
}
