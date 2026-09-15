"use client";

import { useState } from "react";

import { FieldGroup, FieldReview, InlineEditorActions, TextInput } from "@/components/fields/field-review";
import { FieldStatusBadge } from "@/components/subscriptions/field-status-badge";
import { Button, Disclosure, Feedback, FieldFrame, Surface } from "@/components/ui/foundations";

export function FoundationsGallery() {
  const [note, setNote] = useState("Synthetic note — no subscription is changed here.");
  const [feedback, setFeedback] = useState("Choose a control to see its feedback state.");

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <a className="skip-link ui-button ui-button--primary" href="#gallery-feedback">
        Skip to feedback
      </a>
      <header className="space-y-2">
        <p className="ui-label">SUB-78 · synthetic review fixture</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ui-ink">Workspace foundations</h1>
        <p className="max-w-2xl text-sm text-ui-muted">
          Compare the approved calm, compact hierarchy at desktop, tablet and 320–390px. This
          page uses no account data and writes nothing to the ledger.
        </p>
      </header>

      <Surface className="space-y-4 p-4 sm:p-6" id="gallery-feedback">
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
          <FieldReview label="Proposed amount" value="£15.00" hasValue status="proposed" note="Confirms on Accept" onConfirm={() => setFeedback("Only the proposed amount is staged.")} onUndo={() => setFeedback("Amount confirmation was unstaged.")} />
          <FieldReview label="Very long plan name and account context that must wrap without clipping" value="A long synthetic plan description for a separate studio account, kept visible at narrow widths" hasValue status="confirmed" />
          <FieldReview emptyCopy="None" hasValue={false} label="Notes" status={null} value="—" editor={<TextInput label="Notes" value={note} onChange={setNote} />} />
        </div>
        <div className="ui-proposal mt-4">
          <h3 className="text-sm font-semibold text-ui-ink">Pending update</h3>
          <ul className="ui-difference-list">
            <li className="ui-difference">
              <div className="ui-difference-saved">
                <p className="ui-label">Saved amount</p>
                <div className="ui-field-value-row">
                  <span className="ui-field-value">£12.00</span>
                </div>
              </div>
              <div className="ui-difference-proposed">
                <FieldReview confirmLabel="Confirm amount" label="Proposed amount" value="£15.00" hasValue status="proposed" note="Proposed — confirms on Accept" onConfirm={() => setFeedback("Only this card's amount is staged.")} />
              </div>
            </li>
          </ul>
        </div>
      </Surface>

      <Surface className="space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ui-ink">Status and disclosure</h2>
        <p className="text-sm text-ui-muted">
          Confirmed is unmarked. Proposed, Inferred, Conflicted and Deferred stay labelled.
          Missing is omitted beside Not recorded.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["inferred", "proposed", "deferred", "conflicted"] as const).map((status) => (
            <FieldStatusBadge key={status} status={status} />
          ))}
        </div>
        <Disclosure label="Where this came from (synthetic)">
          <p className="pb-2 text-sm text-ui-muted">Supporting evidence stays secondary and does not change a saved fact.</p>
        </Disclosure>
      </Surface>

      <Surface className="space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ui-ink">Reminder preferences</h2>
        <p className="text-sm text-ui-muted">
          Stored choices sit on the open row. A zero Reminders count does not hide them. Active
          notifications stay a separate computed card with no dismiss control.
        </p>
        <div className="ui-field-list">
          <FieldFrame label="Renewal reminder">
            <div className="ui-field-main">
              <p className="ui-label">Renewal reminder</p>
              <div className="ui-field-value-row">
                <span className="ui-field-value">Not set</span>
              </div>
              <p className="ui-field-note">Not set. You will not be reminded until you choose.</p>
              <p className="ui-field-value mt-2">Suggested: Off</p>
              <p className="ui-field-note">Not applied until you choose it.</p>
            </div>
            <div className="ui-field-actions">
              <Button size="small" variant="quiet" onClick={() => setFeedback("Suggestion is consent only after a deliberate choose.")}>
                Use Off
              </Button>
              <Button size="small" variant="quiet" onClick={() => setFeedback("Fixture renewal editor opened.")}>
                Set
              </Button>
            </div>
          </FieldFrame>
          <FieldFrame label="Trial-end reminder">
            <div className="ui-field-main">
              <p className="ui-label">Trial-end reminder</p>
              <div className="ui-field-value-row">
                <span className="ui-field-value">Enabled · 3 days before</span>
              </div>
              <p className="ui-field-note">Enabled, but there is no date yet so no reminder can be shown.</p>
            </div>
            <div className="ui-field-actions">
              <Button size="small" variant="quiet" onClick={() => setFeedback("Fixture trial-end editor opened.")}>
                Edit
              </Button>
            </div>
          </FieldFrame>
        </div>
        <Disclosure label="Notes, dates and supporting details">
          <p className="pb-2 text-sm text-ui-muted">
            Account identity sits with plan under the provider on the list row.
            Notes, started/ends dates, amendments and evidence stay behind
            disclosure so they do not dominate daily reminder actions.
          </p>
        </Disclosure>
      </Surface>

      <Surface className="space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ui-ink">Capture and questions</h2>
        <p className="text-sm text-ui-muted">
          One target chip, file/voice/send, and conversation jump. Later stays reachable with no
          promised date. Original multi-item captures stay behind disclosure.
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-medium text-emerald-950">Juniper Cloud</p>
          <Button size="small" variant="quiet" onClick={() => setFeedback("Fixture returned to this subscription.")}>
            All subscriptions
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="small">Add screenshot or PDF</Button>
          <Button size="small">Record a voice note</Button>
          <Button
            size="small"
            variant="primary"
            onClick={() => setFeedback("Fixture capture stayed a proposal.")}
          >
            Send
          </Button>
        </div>
        <p className="text-sm text-ui-ink">What does Juniper Cloud cost?</p>
        <p className="text-xs text-ui-muted">Juniper Cloud · Price · Deferred — still available here</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="small"
            variant="primary"
            onClick={() => setFeedback("Fixture selected the exact question target.")}
          >
            Answer
          </Button>
        </div>
        <Disclosure label="Original capture">
          <p className="pb-2 text-sm text-ui-muted">
            Netflix · 4 items captured stays the summary. The pasted list remains inspectable here
            and is not rewritten.
          </p>
        </Disclosure>
      </Surface>

      <Surface className="space-y-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ui-ink">Loading, empty and recovery</h2>
        <p className="text-sm text-ui-muted">
          Loading is a status, not an empty list. Errors keep a retry. Selection uses a border and
          a pressed state, not colour alone.
        </p>
        <p className="ui-feedback ui-feedback--info" role="status">
          Loading subscriptions…
        </p>
        <div className="rounded-[var(--ui-radius-md)] border border-dashed border-ui-line px-6 py-8 text-center">
          <p className="text-base font-medium text-ui-ink">No matching subscriptions.</p>
          <p className="mt-2 text-sm text-ui-muted">
            Nothing in this list matches that search. Clear the search to see every row again.
          </p>
        </div>
        <Feedback tone="error">Synthetic list failure. The last view remains available to retry.</Feedback>
        <Button size="small" variant="primary" onClick={() => setFeedback("Fixture list retry stayed local.")}>
          Retry
        </Button>
        <p className="ui-feedback ui-feedback--info">
          This row no longer matches this filter. It stays open until you close it.
        </p>
      </Surface>
    </main>
  );
}
