"use client";

import { useState } from "react";

import { FieldGroup, FieldReview, InlineEditorActions, TextInput } from "@/components/fields/field-review";
import { FieldStatusBadge } from "@/components/subscriptions/field-status-badge";
import { Button, Disclosure, Feedback, Surface } from "@/components/ui/foundations";

export function FoundationsGallery() {
  const [note, setNote] = useState("Synthetic note — no subscription is changed here.");
  const [feedback, setFeedback] = useState("Choose a control to see its feedback state.");

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <header className="space-y-2">
        <p className="ui-label">SUB-75 · synthetic review fixture</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ui-ink">Workspace foundations</h1>
        <p className="max-w-2xl text-sm text-ui-muted">
          Compare the approved calm, compact hierarchy at desktop and 390px. This page uses no account
          data and writes nothing to the ledger.
        </p>
      </header>

      <Surface className="space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ui-ink">Buttons and feedback</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setFeedback("Primary action completed in this fixture.")}>Primary action</Button>
          <Button onClick={() => setFeedback("Secondary action completed in this fixture.")}>Secondary action</Button>
          <Button variant="quiet" onClick={() => setFeedback("Quiet action completed in this fixture.")}>Quiet action</Button>
          <Button variant="danger" onClick={() => setFeedback("Destructive action was not performed.")}>Destructive action</Button>
          <Button disabled>Disabled action</Button>
          <Button disabled variant="primary" aria-busy="true">Saving…</Button>
        </div>
        <Feedback tone="success">{feedback}</Feedback>
        <Feedback tone="error">Synthetic save failure. The entered value remains available to retry.</Feedback>
      </Surface>

      <Surface className="space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ui-ink">Field review</h2>
        <div className="ui-field-list">
          <FieldGroup label="Price and cadence">
            <FieldReview label="Amount" value="£12.00" hasValue status="inferred" onConfirm={() => setFeedback("Only the synthetic amount was confirmed.")} editor={<div className="space-y-2"><TextInput label="Correct amount" value={note} onChange={setNote} /><InlineEditorActions onSave={() => setFeedback("Fixture edit saved locally.")} onCancel={() => setFeedback("Fixture edit cancelled.")} /></div>} />
            <FieldReview label="Cadence" value="Monthly" hasValue status="proposed" onConfirm={() => setFeedback("Only the synthetic cadence was confirmed.")} />
          </FieldGroup>
          <FieldReview label="Recorded renewal" value="Not recorded" hasValue={false} status="empty" editor={<TextInput label="Recorded renewal" value={note} onChange={setNote} />} />
          <FieldReview label="Expected next renewal" value="6 Oct 2026" hasValue status="inferred" readOnly note="Inferred from the confirmed schedule. This date is not stored and cannot be confirmed." />
          <FieldReview label="Proposed amount" value="£15.00" hasValue status="proposed" note="Confirmed when you accept" onConfirm={() => setFeedback("Only the proposed amount is staged.")} onUndo={() => setFeedback("Amount confirmation was unstaged.")} />
          <FieldReview label="Very long plan name and account context that must wrap without clipping" value="A long synthetic plan description for a separate studio account, kept visible at narrow widths" hasValue status="confirmed" />
        </div>
        <div className="ui-proposal mt-4">
          <h3 className="text-sm font-semibold text-ui-ink">Pending update</h3>
          <ul className="ui-difference-list">
            <li className="ui-difference">
              <div className="ui-difference-saved">
                <p className="ui-label">Saved amount</p>
                <div className="ui-field-value-row">
                  <span className="ui-field-value">£12.00</span>
                  <FieldStatusBadge status="confirmed" />
                </div>
              </div>
              <div className="ui-difference-proposed">
                <FieldReview confirmLabel="Confirm amount" label="Proposed amount" value="£15.00" hasValue status="proposed" note="Proposed — not confirmed" onConfirm={() => setFeedback("Only this card's amount is staged.")} />
              </div>
            </li>
          </ul>
        </div>
      </Surface>

      <Surface className="space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ui-ink">Status and disclosure</h2>
        <div className="flex flex-wrap gap-2">
          {(["confirmed", "inferred", "proposed", "deferred", "empty", "conflicted"] as const).map((status) => (
            <FieldStatusBadge key={status} status={status} />
          ))}
        </div>
        <Disclosure label="Where this came from (synthetic)">
          <p className="pb-2 text-sm text-ui-muted">Supporting evidence stays secondary and does not change a saved fact.</p>
        </Disclosure>
      </Surface>
    </main>
  );
}
