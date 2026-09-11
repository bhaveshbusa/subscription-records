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
import { currencyOptions, fieldActions } from "@/lib/fields/review";
import { autoRenewalLabel, cadenceLabel } from "@/lib/subscriptions/format";
import {
  AUTO_RENEWALS,
  CADENCES,
  type AutoRenewal,
  type Cadence,
} from "@/lib/subscriptions/params";
import type { FieldStatus } from "@/lib/subscriptions/projection";

const ACTION_CLASS =
  "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-60";

const CONFIRM_CLASS = `${ACTION_CLASS} border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-600`;
const EDIT_CLASS = `${ACTION_CLASS} border-stone-300 bg-white text-stone-800 hover:border-stone-500`;

export const FIELD_INPUT_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60";

export const FIELD_LABEL_CLASS =
  "flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500";

const CloseEditorContext = createContext<() => void>(() => {});

/** Closes the enclosing field's editor and returns focus to its Edit/Add control. */
export function useCloseEditor(): () => void {
  return useContext(CloseEditorContext);
}

/**
 * One reviewable field: its value, its trust, and the controls that act on
 * exactly this field. Confirm is offered for a value that exists but is not yet
 * trusted; Edit or Add opens an editor prefilled by the caller. Nothing here
 * decides what a save sends — the surface owning the data does — so the same
 * component reviews a proposal card and a stored record.
 */
export function FieldReview({
  label,
  value,
  hasValue,
  status,
  note,
  disabled = false,
  onConfirm,
  onUndo,
  error,
  editor,
  confirmLabel = "Confirm",
}: {
  label: string;
  /** The value as shown; "—" or similar when missing. */
  value: string;
  hasValue: boolean;
  /** Trust of the field, or null for a field that has none (notes, plan on a card). */
  status: FieldStatus | null;
  /** A line under the badge, e.g. what accepting will do to this field. */
  note?: ReactNode;
  disabled?: boolean;
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
  const editorRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const actions = fieldActions(status, hasValue);

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

  return (
    <div className="min-w-0" role="group" aria-labelledby={labelId}>
      <p className="text-sm text-stone-500" id={labelId}>
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-medium text-stone-900">{value}</span>
        {status !== null ? <FieldStatusBadge status={status} /> : null}
      </div>
      {note ? <p className="mt-1 text-xs text-emerald-800">{note}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {onUndo ? (
          <button
            aria-label={`Undo ${label}`}
            className={EDIT_CLASS}
            disabled={disabled}
            onClick={onUndo}
            type="button"
          >
            Undo
          </button>
        ) : onConfirm && actions.confirm && !open ? (
          <button
            aria-label={`${confirmLabel} ${label}: ${value}`}
            className={CONFIRM_CLASS}
            disabled={disabled}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        ) : null}
        {editor ? (
          <button
            aria-controls={editorId}
            aria-expanded={open}
            aria-label={`${open ? "Close" : editLabel} ${label}`}
            className={EDIT_CLASS}
            disabled={disabled}
            onClick={() => (open ? close() : setOpen(true))}
            ref={toggleRef}
            type="button"
          >
            {open ? "Close" : editLabel}
          </button>
        ) : null}
      </div>
      {open && editor ? (
        <div
          className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-3"
          id={editorId}
          ref={editorRef}
        >
          <CloseEditorContext.Provider value={close}>
            {editor}
          </CloseEditorContext.Provider>
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
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
      <button
        className="rounded-xl bg-emerald-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-60"
        disabled={disabled || saving}
        onClick={onSave}
        type="button"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      <button
        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-60"
        disabled={saving}
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
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
