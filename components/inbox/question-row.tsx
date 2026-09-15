import { Button } from "@/components/ui/foundations";
import type { FollowUpReason } from "@/lib/capture/follow-up";
import type { InboxQuestion } from "@/lib/inbox/query";

function reasonLabel(reason: FollowUpReason): string {
  switch (reason) {
    case "amount":
      return "Price";
    case "cadence":
      return "Billing";
    case "renewal":
      return "Renewal date";
    case "cancel_timing":
      return "When it stopped";
    case "cancel_intention":
      return "Remind me to cancel";
    case "account_identity":
      return "Same subscription?";
    case "duplicate":
      return "Already in the ledger?";
    case "still_holding":
      return "Still holding?";
  }
}

/**
 * One capture question as Inbox work. There is no dismiss: it leaves by being
 * answered or put off, and putting it off is not a reminder dismissal. Later
 * stays unresolved and reachable here, with no promised date.
 */
export function InboxQuestionRow({
  question,
  prominent = false,
  selected = false,
  busy = false,
  onAnswer,
  onDefer,
}: {
  question: InboxQuestion;
  prominent?: boolean;
  selected?: boolean;
  busy?: boolean;
  onAnswer: (question: InboxQuestion) => void;
  onDefer: (question: InboxQuestion) => void;
}) {
  const deferred = question.state === "deferred";

  return (
    <div
      className={
        selected
          ? "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-emerald-700 bg-white px-4 py-3"
          : prominent
            ? "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-stone-300 bg-white px-4 py-3"
            : "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3"
      }
    >
      <div className="min-w-0">
        <p className={prominent ? "font-medium text-stone-900" : "font-semibold text-stone-900"}>
          {question.question}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          {question.provider}
          {` · ${reasonLabel(question.reason)}`}
          {deferred ? " · Deferred — still available here" : ""}
          {selected ? " · Answering in the message box" : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={() => onAnswer(question)}
          size="small"
          variant="primary"
        >
          Answer
        </Button>
        {deferred ? null : (
          <Button disabled={busy} onClick={() => onDefer(question)} size="small" variant="secondary">
            Later
          </Button>
        )}
      </div>
    </div>
  );
}
