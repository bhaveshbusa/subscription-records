"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { FieldStatusBadge } from "@/components/subscriptions/field-status-badge";
import { Button, Feedback, FieldFrame, Surface } from "@/components/ui/foundations";
import {
  CONFLICT_REVIEW_NOTE,
  confirmActionLabel,
  currencyOptions,
  displayFieldValue,
  fieldActions,
} from "@/lib/fields/review";
import { autoRenewalLabel, cadenceLabel } from "@/lib/subscriptions/format";
import {
  AUTO_RENEWALS,
  CADENCES,
  type AutoRenewal,
  type Cadence,
} from "@/lib/subscriptions/params";
import type { FieldStatus } from "@/lib/subscriptions/projection";

export const FIELD_INPUT_CLASS =
  "ui-input";

export const FIELD_LABEL_CLASS =
  "ui-label flex flex-col gap-1";

const CloseEditorContext = createContext<() => void>(() => {});

/** Closes the enclosing field's editor and returns focus to its Edit/Add control. */
export function useCloseEditor(): () => void {
  return useContext(CloseEditorContext);
}

/**
 * Amount and cadence share a visual group; each field still writes and confirms
 * only itself.
 */
export function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div aria-label={label} className="ui-field-group" role="group">
      {children}
    </div>
  );
}

/**
 * One reviewable field as a compact line: label, prominent value, trust word,
 * and the action that applies to exactly this field. Confirm is offered for a
 * value that exists but is not yet trusted; Edit or Add opens an editor
 * prefilled by the caller. Nothing here decides what a save sends — the
 * surface owning the data does — so the same component reviews a proposal
 * card and a stored record.
 */
export function FieldReview({
  label,
  value,
  hasValue,
  status,
  note,
  disabled = false,
  saving = false,
  success,
  readOnly = false,
  onConfirm,
  onUndo,
  error,
  editor,
  confirmLabel,
}: {
  label: string;
  /** The value as shown; missing money and dates become "Not recorded". */
  value: string;
  hasValue: boolean;
  /** Trust of the field, or null for a field that has none (notes, plan on a card). */
  status: FieldStatus | null;
  /** A line under the badge, e.g. what accepting will do to this field. */
  note?: ReactNode;
  disabled?: boolean;
  /** This field's confirm is in flight; the value stays visible. */
  saving?: boolean;
  /** Field-specific success after a confirm or save. */
  success?: string | null;
  /** Expected dates and other projections: visible trust, no confirm or edit. */
  readOnly?: boolean;
  /** Confirms exactly this field's current value. Omit for a field that cannot be confirmed. */
  onConfirm?: () => void;
  /** Takes back a staged confirmation or edit. Rendered instead of Confirm when present. */
  onUndo?: () => void;
  error?: string | null;
  /** The editor, rendered while open; omit for a read-only field. */
  editor?: ReactNode;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const editorId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const actions = fieldActions(readOnly ? "confirmed" : status, hasValue);
  const shown = displayFieldValue(value, hasValue);
  const confirmText = confirmLabel ?? confirmActionLabel(label);
  const busy = disabled || saving;
  const explanation =
    note ?? (status === "conflicted" ? CONFLICT_REVIEW_NOTE : undefined);
  const canConfirm = Boolean(onConfirm && actions.confirm && !readOnly && !open);

  useEffect(() => {
    if (open) {
      editorRef.current
        ?.querySelector<HTMLElement>(
          "input:not([type=hidden]), select, textarea",
        )
        ?.focus();
    } else if (wasOpen.current) {
      toggleRef.current?.focus();
    }

    wasOpen.current = open;
  }, [open]);

  const close = () => setOpen(false);

  const editLabel = actions.edit === "add" ? "Add" : "Edit";
  const showEditor = Boolean(editor) && !readOnly;
  const showActions = Boolean(onUndo || canConfirm || showEditor);

  return (
    <FieldFrame label={label} aria-labelledby={labelId}>
      <div className="ui-field-main">
        <p className="ui-label" id={labelId}>
          {label}
        </p>
        <div className="ui-field-value-row">
          <span className="ui-field-value">{shown}</span>
          {status !== null ? <FieldStatusBadge status={status} /> : null}
        </div>
        {explanation ? <p className="ui-field-note">{explanation}</p> : null}
      </div>
      {showActions ? (
        <div className="ui-field-actions">
          {onUndo ? (
            <Button
              aria-label={`Undo ${label}`}
              disabled={busy}
              onClick={onUndo}
              size="small"
              variant="quiet"
            >
              Undo
            </Button>
          ) : canConfirm ? (
            <Button
              aria-busy={saving || undefined}
              aria-label={`${confirmText}: ${shown}`}
              disabled={busy}
              onClick={onConfirm}
              size="small"
              variant="primary"
            >
              {saving ? "Saving…" : confirmText}
            </Button>
          ) : null}
          {showEditor ? (
            <Button
              aria-controls={editorId}
              aria-expanded={open}
              aria-label={`${open ? "Close" : editLabel} ${label}`}
              disabled={busy}
              onClick={() => (open ? close() : setOpen(true))}
              ref={toggleRef}
              size="small"
              variant="quiet"
            >
              {open ? "Close" : editLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      {open && editor ? (
        <Surface
          className="ui-field-editor mt-1 bg-ui-soft p-3"
          id={editorId}
          ref={editorRef}
        >
          <CloseEditorContext.Provider value={close}>
            {editor}
          </CloseEditorContext.Provider>
        </Surface>
      ) : null}
      {error ? <Feedback tone="error">{error}</Feedback> : null}
      {success && !error ? <Feedback tone="success">{success}</Feedback> : null}
    </FieldFrame>
  );
}

/** Save and Cancel for an inline editor, with the error kept next to the draft. */
export function InlineEditorActions({
  onSave,
  onCancel,
  saving = false,
  saveLabel = "Save",
  disabled = false,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        variant="primary"
        disabled={disabled || saving}
        onClick={onSave}
      >
        {saving ? "Saving…" : saveLabel}
      </Button>
      <Button
        disabled={saving}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  disabled,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      {label}
      {multiline ? (
        <textarea
          className={`${FIELD_INPUT_CLASS} min-h-24 font-normal normal-case tracking-normal`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      ) : (
        <input
          className={`${FIELD_INPUT_CLASS} font-normal normal-case tracking-normal`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          type="text"
          value={value}
        />
      )}
    </label>
  );
}

/** Amount and its currency together: a number without a unit is not a price. */
export function AmountInput({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  disabled,
}: {
  amount: string;
  currency: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <label className={FIELD_LABEL_CLASS}>
        Amount
        <input
          className={`${FIELD_INPUT_CLASS} font-normal normal-case tracking-normal`}
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder="9.99"
          value={amount}
        />
      </label>
      <label className={FIELD_LABEL_CLASS}>
        Currency
        <select
          className={`${FIELD_INPUT_CLASS} font-normal normal-case tracking-normal`}
          disabled={disabled}
          onChange={(event) => onCurrencyChange(event.target.value)}
          value={currency}
        >
          {currencyOptions(currency).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function CadenceInput({
  label = "Cadence",
  value,
  onChange,
  disabled,
}: {
  label?: string;
  value: "" | Cadence;
  onChange: (value: "" | Cadence) => void;
  disabled?: boolean;
}) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      {label}
      <select
        className={`${FIELD_INPUT_CLASS} font-normal normal-case tracking-normal`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as "" | Cadence)}
        value={value}
      >
        <option value="">Not recorded</option>
        {CADENCES.map((cadence) => (
          <option key={cadence} value={cadence}>
            {cadenceLabel(cadence)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      {label}
      <input
        className={`${FIELD_INPUT_CLASS} font-normal normal-case tracking-normal`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

export function AutoRenewalInput({
  value,
  onChange,
  disabled,
}: {
  value: "" | AutoRenewal;
  onChange: (value: "" | AutoRenewal) => void;
  disabled?: boolean;
}) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      Auto-renewal
      <select
        className={`${FIELD_INPUT_CLASS} font-normal normal-case tracking-normal`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as "" | AutoRenewal)}
        value={value}
      >
        <option value="">{autoRenewalLabel(null)}</option>
        {AUTO_RENEWALS.map((option) => (
          <option key={option} value={option}>
            {autoRenewalLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
