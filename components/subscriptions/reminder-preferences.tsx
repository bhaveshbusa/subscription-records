"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  FIELD_INPUT_CLASS,
  FIELD_LABEL_CLASS,
  InlineEditorActions,
} from "@/components/fields/field-review";
import { saveSubscription } from "@/components/subscriptions/save-subscription";
import { Button, Disclosure, Feedback, FieldFrame, Surface } from "@/components/ui/foundations";
import {
  reminderInputFromSuggestion,
  reminderPreferenceBody,
  reminderPreferenceSummary,
  reminderPreviewCopy,
  suggestionCopy,
  suggestionMatchesStored,
} from "@/lib/reminders/copy";
import { previewReminder, type ReminderConsent, type ReminderLeadUnit } from "@/lib/reminders/dates";
import type { ReminderPreferenceInput, ReminderPreferenceView } from "@/lib/reminders/preferences";
import { calendarToday } from "@/lib/subscriptions/dates";
import { reminderInputFromForm } from "@/lib/subscriptions/form-values";
import { isTrialHolding } from "@/lib/subscriptions/format";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

function dueDateFor(
  detail: SubscriptionDetail,
  target: "renewal" | "trialEnd",
): { dueDate: string | null; expectedDue: boolean } {
  if (target === "trialEnd") {
    return { dueDate: detail.trialEndsOn.value, expectedDue: false };
  }

  if (detail.expectedNextRenewal) {
    return { dueDate: detail.expectedNextRenewal.value, expectedDue: true };
  }

  return { dueDate: detail.nextRenewal.value, expectedDue: false };
}

function leadDefaults(preference: ReminderPreferenceView): {
  leadValue: string;
  leadUnit: ReminderLeadUnit;
} {
  if (preference.state === "enabled" && preference.leadValue && preference.leadUnit) {
    return { leadValue: String(preference.leadValue), leadUnit: preference.leadUnit };
  }

  if (preference.suggestion.state === "enabled") {
    return {
      leadValue: String(preference.suggestion.leadValue),
      leadUnit: preference.suggestion.leadUnit,
    };
  }

  return { leadValue: "1", leadUnit: "days" };
}

function ReminderPreferenceRow({
  detail,
  target,
  title,
  preference,
  onSaved,
}: {
  detail: SubscriptionDetail;
  target: "renewal" | "trialEnd";
  title: string;
  preference: ReminderPreferenceView;
  onSaved: (next: SubscriptionDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const labelId = useId();
  const editorId = useId();
  const defaults = leadDefaults(preference);
  const [state, setState] = useState<ReminderConsent>(preference.state);
  const [leadValue, setLeadValue] = useState(defaults.leadValue);
  const [leadUnit, setLeadUnit] = useState<ReminderLeadUnit>(defaults.leadUnit);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { dueDate, expectedDue } = dueDateFor(detail, target);
  const summary = reminderPreferenceSummary(
    preference.state,
    preference.leadValue,
    preference.leadUnit,
  );
  const action = preference.state === "unset" ? "Set" : "Edit";
  const showSuggestion = !suggestionMatchesStored(preference);

  useEffect(() => {
    if (open) {
      const editor = editorRef.current;
      (editor?.querySelector<HTMLElement>("input:checked") ??
        editor?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea"))
        ?.focus();
    } else if (wasOpen.current) {
      toggleRef.current?.focus();
    }

    wasOpen.current = open;
  }, [open]);

  function resetDraft() {
    const next = leadDefaults(preference);
    setState(preference.state);
    setLeadValue(next.leadValue);
    setLeadUnit(next.leadUnit);
    setError(null);
  }

  async function save(input: ReminderPreferenceInput) {
    setSaving(true);
    setError(null);

    try {
      const next = await saveSubscription(
        { mode: "edit", id: detail.id },
        reminderPreferenceBody(target, input),
      );
      onSaved(next);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save this reminder choice. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    const parsed = reminderInputFromForm(state, leadValue, leadUnit);

    if (!parsed.ok) {
      setError(parsed.message);

      return;
    }

    await save(parsed.input);
  }

  const enabledLead = Number.parseInt(leadValue, 10);
  const draftLeadValue = state === "enabled" && Number.isInteger(enabledLead) ? enabledLead : null;
  const draftPreview = reminderPreviewCopy(
    {
      ...preference,
      state,
      leadValue: draftLeadValue,
      leadUnit: state === "enabled" ? leadUnit : null,
      preview: previewReminder({
        dueDate,
        state,
        leadValue: draftLeadValue,
        leadUnit: state === "enabled" ? leadUnit : null,
        today: calendarToday(),
      }),
    },
    expectedDue,
  );

  return (
    <FieldFrame label={title} aria-labelledby={labelId}>
      <div className="ui-field-main">
        <p className="ui-label" id={labelId}>
          {title}
        </p>
        <div className="ui-field-value-row">
          <span className="ui-field-value">{summary}</span>
        </div>
        <p className="ui-field-note">{reminderPreviewCopy(preference, expectedDue)}</p>
        {showSuggestion && !open ? (
          <p className="ui-field-note">
            {suggestionCopy(preference.suggestion)}. Not applied until you choose it.
          </p>
        ) : null}
      </div>
      <div className="ui-field-actions">
        {showSuggestion && !open ? (
          <Button
            disabled={saving}
            onClick={() => void save(reminderInputFromSuggestion(preference.suggestion))}
            size="small"
            variant="quiet"
          >
            Use this suggestion
          </Button>
        ) : null}
        <Button
          aria-controls={editorId}
          aria-expanded={open}
          aria-label={`${open ? "Close" : action} ${title}`}
          disabled={saving}
          onClick={() => {
            if (open) {
              resetDraft();
              setOpen(false);
            } else {
              resetDraft();
              setOpen(true);
            }
          }}
          ref={toggleRef}
          size="small"
          variant="quiet"
        >
          {open ? "Close" : action}
        </Button>
      </div>
      {open ? (
        <Surface className="ui-field-editor mt-1 bg-ui-soft p-3" id={editorId} ref={editorRef}>
          <fieldset className="space-y-2">
            <legend className="ui-label">{title} choice</legend>
            {(
              [
                ["unset", "Not set — no stored choice"],
                ["off", "Off — no reminder for this"],
                ["enabled", "Enabled — remind me ahead of time"],
              ] as const
            ).map(([value, label]) => (
              <label className="flex items-center gap-2 text-sm text-stone-800" key={value}>
                <input
                  checked={state === value}
                  className="h-4 w-4 accent-emerald-800"
                  disabled={saving}
                  name={`${editorId}-state`}
                  onChange={() => setState(value)}
                  type="radio"
                  value={value}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {state === "enabled" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className={FIELD_LABEL_CLASS}>
                How far ahead
                <input
                  className={FIELD_INPUT_CLASS}
                  disabled={saving}
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => setLeadValue(event.target.value)}
                  type="number"
                  value={leadValue}
                />
              </label>
              <label className={FIELD_LABEL_CLASS}>
                Unit
                <select
                  className={FIELD_INPUT_CLASS}
                  disabled={saving}
                  onChange={(event) => setLeadUnit(event.target.value as ReminderLeadUnit)}
                  value={leadUnit}
                >
                  <option value="days">days</option>
                  <option value="months">calendar months</option>
                </select>
              </label>
            </div>
          ) : null}
          <p className="ui-field-note mt-3">{draftPreview}</p>
          <p className="ui-field-note">
            Saves this preference only. Price, dates and auto-renewal stay as they are.
          </p>
          {error ? <Feedback tone="error">{error}</Feedback> : null}
          <InlineEditorActions
            onCancel={() => {
              resetDraft();
              setOpen(false);
            }}
            onSave={() => void onSave()}
            saveLabel="Save"
            saving={saving}
          />
        </Surface>
      ) : null}
    </FieldFrame>
  );
}

export function showTrialEndReminder(
  detail: SubscriptionDetail,
  force = false,
): boolean {
  return (
    force ||
    isTrialHolding(detail.status.value) ||
    detail.trialEndsOn.value != null ||
    detail.reminderPreferences.trialEnd.state !== "unset"
  );
}

/**
 * Renewal and trial-end choices on the open row. Independent of auto-renewal
 * and of each other; a zero Reminders count does not hide them.
 */
export function ReminderPreferences({
  detail,
  onSaved,
  forceTrialEnd = false,
}: {
  detail: SubscriptionDetail;
  onSaved: (next: SubscriptionDetail) => void;
  forceTrialEnd?: boolean;
}) {
  return (
    <section
      aria-labelledby={`reminders-heading-${detail.id}`}
      className="rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8"
      id={`reminders-${detail.id}`}
    >
      <h2 className="text-lg font-semibold text-stone-950" id={`reminders-heading-${detail.id}`} tabIndex={-1}>
        Reminders
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        Renewal and trial-end are independent of each other and of auto-renewal.
        A notification has no dismiss control; it appears from its reminder date through the due date.
      </p>
      <Disclosure className="mt-3" label="How reminder choices work">
        <p className="pb-2 text-sm text-stone-600">
          Not set is not off. Suggestions are never stored until you choose them.
          Missing dates can still keep a preference; no dated card is invented.
        </p>
      </Disclosure>
      <div className="ui-field-list mt-4">
        <ReminderPreferenceRow
          detail={detail}
          onSaved={onSaved}
          preference={detail.reminderPreferences.renewal}
          target="renewal"
          title="Renewal reminder"
        />
        {showTrialEndReminder(detail, forceTrialEnd) ? (
          <ReminderPreferenceRow
            detail={detail}
            onSaved={onSaved}
            preference={detail.reminderPreferences.trialEnd}
            target="trialEnd"
            title="Trial-end reminder"
          />
        ) : null}
      </div>
    </section>
  );
}
