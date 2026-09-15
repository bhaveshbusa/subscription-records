"use client";

import { useState } from "react";

import {
  DateInput,
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  InlineEditorActions,
  TextInput,
  useCloseEditor,
} from "@/components/fields/field-review";
import { Button, Feedback } from "@/components/ui/foundations";
import { calendarToday } from "@/lib/subscriptions/dates";
import { statusLabel } from "@/lib/subscriptions/format";
import type { SubscriptionWriteBody } from "@/lib/subscriptions/form-values";
import { SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/params";
import {
  statusEditNeedsTiming,
  toStatusEditBody,
  type FormStatus,
} from "@/lib/subscriptions/status-edit";

/**
 * Inline Status editor: ordinary corrections are status-only; cancel,
 * cancel_scheduled, and reactivate expand timing before the shared writers run.
 */
export function StatusFieldEditor({
  initialStatus,
  initialNotes,
  save,
  onSuccess,
}: {
  initialStatus: FormStatus;
  initialNotes: string;
  save: (body: SubscriptionWriteBody) => Promise<string | null>;
  onSuccess?: (message: string) => void;
}) {
  const close = useCloseEditor();
  const [status, setStatus] = useState<FormStatus>(initialStatus);
  const [endsOn, setEndsOn] = useState("");
  const [resumedOn, setResumedOn] = useState(calendarToday);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ending = status === "cancelled" && initialStatus !== "cancelled";
  const scheduling =
    status === "cancel_scheduled" && initialStatus !== "cancel_scheduled";
  const resuming = initialStatus === "cancelled" && status !== "cancelled";
  const needsTiming = statusEditNeedsTiming(initialStatus, status);

  async function commit(unknownTiming = false) {
    setError(null);

    const result = toStatusEditBody({
      initialStatus,
      initialNotes,
      draft: { status, endsOn, resumedOn, notes },
      unknownTiming,
    });

    if (!result.ok) {
      setError(result.message);

      return;
    }

    if (result.kind === "noop") {
      close();

      return;
    }

    if (Object.keys(result.body).length === 0) {
      onSuccess?.(result.success);
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

    onSuccess?.(result.success);
    close();
  }

  return (
    <div>
      <label className={FIELD_LABEL_CLASS}>
        Status
        <select
          className={`${FIELD_INPUT_CLASS} font-normal normal-case tracking-normal`}
          disabled={saving}
          onChange={(event) => setStatus(event.target.value as FormStatus)}
          value={status}
        >
          {SUBSCRIPTION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      </label>

      {ending ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-stone-600">
            Ending uses the same lifecycle write as an accepted cancel. A stored
            renewal is not when it ended — say the actual date, or that you do not
            know.
          </p>
          <DateInput label="Ended on" onChange={setEndsOn} value={endsOn} />
          <TextInput
            label="Notes"
            multiline
            onChange={setNotes}
            value={notes}
          />
        </div>
      ) : null}

      {scheduling ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-stone-600">
            Schedules an ending and keeps billing until that date. Set Ends on to
            the last day it still bills.
          </p>
          <DateInput label="Ends on" onChange={setEndsOn} value={endsOn} />
        </div>
      ) : null}

      {resuming ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-stone-600">
            Brings the same subscription back. Prior terms stay in history.
          </p>
          <DateInput label="Resumed on" onChange={setResumedOn} value={resumedOn} />
        </div>
      ) : null}

      {!needsTiming && status !== initialStatus ? (
        <p className="mt-3 text-sm text-stone-600">
          Saves status only. Amount, cadence, dates, and auto-renewal keep their
          values and trust.
        </p>
      ) : null}

      {error ? <Feedback tone="error">{error}</Feedback> : null}

      {ending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={saving} onClick={() => void commit(false)} variant="primary">
            {saving ? "Saving…" : "Confirm cancelled"}
          </Button>
          <Button disabled={saving} onClick={() => void commit(true)} variant="secondary">
            I don&apos;t know when
          </Button>
          <Button disabled={saving} onClick={close} variant="quiet">
            Cancel
          </Button>
        </div>
      ) : (
        <InlineEditorActions
          onCancel={close}
          onSave={() => void commit(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
