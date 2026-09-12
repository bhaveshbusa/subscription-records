import type { InboxQuestion, InboxReminder, InboxSections } from "@/lib/inbox/query";
import type { ProposalView } from "@/lib/proposals/projection";
import { formatDate, isTrialHolding } from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import type { WorkspaceFilter } from "./view";

/**
 * The subscription list, with everything the workspace knows about each
 * subscription folded onto it.
 *
 * The server answers separate questions — the inventory, the pending cards,
 * the open questions, the reminders that are visible today, the holdings that
 * need reconciling — and each answer is right on its own. Shown side by side
 * they make the person do the joining: this card is about that row, that
 * question is about this card. Joining here, on the stable holding id, gives
 * one entry per subscription carrying every pending card, question, reminder,
 * and reason it is work, so a filter can find it and its open row can show the
 * relevant thing first.
 *
 * Nothing is merged on a name. A pending `create` with no holding is its own
 * entry — a subscription not added yet — and a question that names no holding
 * stays with the draft it was asked about, or on its own when there is none.
 * The server decided identity; this only groups by what it decided.
 */

/** Why a saved holding is waiting: a passed date, or a term that cannot be read as settled. */
export type WorkReason = "overdue" | "unfinished";

export type SubscriptionEntry = {
  /** Stable across re-reads: the holding id, or the pending card's id for a draft. */
  key: string;
  kind: "saved" | "draft";
  /** The holding, when the entry is one. */
  subscriptionId: string | null;
  /**
   * The inventory row. Null for a draft, and for a saved holding a pending
   * card or question names that the current page of the inventory does not
   * hold — its provider is still known from the card or question.
   */
  item: SubscriptionListItem | null;
  provider: string;
  /** The pending `create` a draft is; null for a saved holding. */
  draft: ProposalView | null;
  /** Pending cards about this subscription, in the order the server listed them. */
  proposals: ProposalView[];
  questions: InboxQuestion[];
  reminders: InboxReminder[];
  reasons: WorkReason[];
};

export type SubscriptionListInput = {
  items: SubscriptionListItem[];
  proposals: ProposalView[];
  sections: InboxSections;
};

export type FilterCounts = Record<WorkspaceFilter, number>;

export const DRAFT_KEY_PREFIX = "draft:";
const QUESTION_KEY_PREFIX = "question:";

/** The name a pending card is about, whatever it knows. */
export function proposalProvider(proposal: ProposalView): string {
  return proposal.payload?.provider?.value ?? proposal.subscriptionProvider ?? "Unknown provider";
}

function itemProvider(item: SubscriptionListItem): string {
  return item.provider.value ?? "Unknown provider";
}

export function draftKey(proposalId: string): string {
  return `${DRAFT_KEY_PREFIX}${proposalId}`;
}

function normalize(provider: string): string {
  return provider.trim().toLocaleLowerCase();
}

/** The payload field whose value would answer a question, by the question's reason. */
const ANSWERING_FIELD: Partial<
  Record<InboxQuestion["reason"], "amountMinor" | "cadence" | "nextRenewal">
> = {
  amount: "amountMinor",
  cadence: "cadence",
  renewal: "nextRenewal",
};

/**
 * Whether a pending card on this entry already carries what the question asks
 * for. The question is still open on the server — a card is not an answer
 * until accepted — but there is nothing to ask the person while the card that
 * would settle it awaits their decision. Accepting the card closes the
 * question; rejecting it puts the question back, unchanged.
 */
export function answeredByPendingCard(
  entry: SubscriptionEntry,
  question: InboxQuestion,
): boolean {
  const field = ANSWERING_FIELD[question.reason];

  if (!field) {
    return false;
  }

  return entry.proposals.some(
    (proposal) => proposal.state === "pending" && proposal.payload?.[field] !== undefined,
  );
}

function savedEntry(subscriptionId: string, provider: string): SubscriptionEntry {
  return {
    key: subscriptionId,
    kind: "saved",
    subscriptionId,
    item: null,
    provider,
    draft: null,
    proposals: [],
    questions: [],
    reminders: [],
    reasons: [],
  };
}

export function buildSubscriptionEntries(input: SubscriptionListInput): SubscriptionEntry[] {
  const saved = new Map<string, SubscriptionEntry>();
  const drafts: SubscriptionEntry[] = [];
  const loose: SubscriptionEntry[] = [];

  const holding = (subscriptionId: string, provider: string) => {
    let entry = saved.get(subscriptionId);

    if (!entry) {
      entry = savedEntry(subscriptionId, provider);
      saved.set(subscriptionId, entry);
    }

    return entry;
  };

  for (const item of input.items) {
    const entry = holding(item.id, itemProvider(item));

    entry.item = item;
    entry.provider = itemProvider(item);
  }

  for (const proposal of input.proposals) {
    if (proposal.state !== "pending") {
      continue;
    }

    if (proposal.subscriptionId) {
      holding(proposal.subscriptionId, proposalProvider(proposal)).proposals.push(proposal);

      continue;
    }

    drafts.push({
      key: draftKey(proposal.id),
      kind: "draft",
      subscriptionId: null,
      item: null,
      provider: proposalProvider(proposal),
      draft: proposal,
      proposals: [proposal],
      questions: [],
      reminders: [],
      reasons: [],
    });
  }

  for (const reason of ["overdue", "unfinished"] as const) {
    for (const item of reason === "overdue" ? input.sections.overdue : input.sections.unfinished) {
      const entry = holding(item.id, itemProvider(item));

      if (!entry.item) {
        entry.item = item;
      }

      if (!entry.reasons.includes(reason)) {
        entry.reasons.push(reason);
      }
    }
  }

  for (const reminder of input.sections.reminders) {
    const entry = holding(reminder.subscriptionId, itemProvider(reminder.item));

    if (!entry.item) {
      entry.item = reminder.item;
    }

    entry.reminders.push(reminder);
  }

  for (const question of input.sections.questions) {
    if (question.subscriptionId) {
      holding(question.subscriptionId, question.provider).questions.push(question);

      continue;
    }

    /**
     * A question about no holding was asked of a draft, and is scoped to the
     * one it would become: the provider plus the account named. That is the
     * draft it belongs to, whatever else shares the name — two accounts at one
     * provider are two drafts, each with its own questions. A question whose
     * scope names no card falls back to the provider alone, and only when one
     * draft carries that name; several is exactly the case where identity is
     * open, so the question is not attached to any of them.
     */
    const scoped = drafts.find(
      (draft) => draft.draft?.draftScope !== null && draft.draft?.draftScope === question.scopeKey,
    );

    if (scoped) {
      scoped.questions.push(question);

      continue;
    }

    const candidates = drafts.filter(
      (draft) => normalize(draft.provider) === normalize(question.provider),
    );

    if (candidates.length === 1) {
      candidates[0].questions.push(question);

      continue;
    }

    loose.push({
      key: `${QUESTION_KEY_PREFIX}${question.id}`,
      kind: "draft",
      subscriptionId: null,
      item: null,
      provider: question.provider,
      draft: null,
      proposals: [],
      questions: [question],
      reminders: [],
      reasons: [],
    });
  }

  const entries = [...saved.values(), ...drafts, ...loose];

  for (const entry of entries) {
    entry.questions = entry.questions.filter((question) => !answeredByPendingCard(entry, question));
  }

  return entries;
}

/**
 * Whether an entry is under a filter. All is the saved inventory alone: a
 * draft is not a holding, so it appears only where its pending card does.
 * Pending reviews is anything that needs a decision — a card, or a holding
 * that needs reconciling or finishing — so nothing the old Work view listed
 * has become unreachable.
 */
export function matchesFilter(entry: SubscriptionEntry, filter: WorkspaceFilter): boolean {
  switch (filter) {
    case "all":
      return entry.kind === "saved";
    case "reviews":
      return entry.proposals.length > 0 || entry.reasons.length > 0;
    case "questions":
      return entry.questions.length > 0;
    case "reminders":
      return entry.reminders.length > 0;
  }
}

/** One count per filter: subscriptions and drafts, not cards or questions. */
export function filterCounts(entries: SubscriptionEntry[]): FilterCounts {
  const counts: FilterCounts = { all: 0, reviews: 0, questions: 0, reminders: 0 };

  for (const entry of entries) {
    for (const filter of Object.keys(counts) as WorkspaceFilter[]) {
      if (matchesFilter(entry, filter)) {
        counts[filter] += 1;
      }
    }
  }

  return counts;
}

/**
 * The rows a filter shows: what matches, plus the open row wherever it now
 * belongs, so accepting the last card under Pending reviews leaves the
 * outcome in front of the person until they close it or change filter.
 */
export function visibleEntries(
  entries: SubscriptionEntry[],
  filter: WorkspaceFilter,
  openKey: string | null,
): SubscriptionEntry[] {
  const visible = entries.filter(
    (entry) => entry.key === openKey || matchesFilter(entry, filter),
  );

  if (filter !== "reminders") {
    return visible;
  }

  return [...visible].sort((a, b) => {
    const left = a.reminders[0]?.dueDate ?? "9999-99-99";
    const right = b.reminders[0]?.dueDate ?? "9999-99-99";

    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export type OpenEntry = { recordId: string | null; draftId: string | null };

/**
 * How an entry is named in the URL: a holding by its id, a draft by the id of
 * its card — or, for a question asked of no card, of the question itself.
 */
export function openEntry(entry: SubscriptionEntry): OpenEntry {
  if (entry.subscriptionId) {
    return { recordId: entry.subscriptionId, draftId: null };
  }

  return {
    recordId: null,
    draftId: entry.draft?.id ?? entry.questions[0]?.id ?? null,
  };
}

export function findEntry(
  entries: SubscriptionEntry[],
  open: OpenEntry,
): SubscriptionEntry | null {
  if (open.recordId) {
    return entries.find((entry) => entry.key === open.recordId) ?? null;
  }

  if (!open.draftId) {
    return null;
  }

  const keys = [draftKey(open.draftId), `${QUESTION_KEY_PREFIX}${open.draftId}`];
  const named = entries.find((entry) => keys.includes(entry.key));

  if (named) {
    return named;
  }

  /** A question's id also opens whatever it is attached to — a draft it was asked about. */
  return (
    entries.find(
      (entry) =>
        !entry.subscriptionId &&
        entry.questions.some((question) => question.id === open.draftId),
    ) ?? null
  );
}

/**
 * Why a saved holding is waiting, in the row's own terms: the date that
 * passed, or the term that cannot be read as settled. The generic reason
 * label alone does not tell the user what to decide.
 */
export function reasonDetail(item: SubscriptionListItem, reason: WorkReason): string {
  if (reason === "overdue") {
    const trial = isTrialHolding(item.status.value);
    const trialEnd = item.trialEndsOn.value;
    const due = item.nextRenewal.value;

    if (trial && trialEnd && (due === null || trialEnd <= due)) {
      return `Trial ended ${formatDate(trialEnd)} — still holding it?`;
    }

    return due
      ? `Was due ${formatDate(due)} — still holding it?`
      : "A payment date has passed — still holding it?";
  }

  if (item.status.value === "unknown") {
    return "Status unknown — do you still have this?";
  }

  const conflicted = (["amount", "cadence", "nextRenewal"] as const).filter(
    (field) => item[field].status === "conflicted",
  );

  if (conflicted.length > 0) {
    return `Conflicting ${conflicted.map((field) => FIELD_LABEL[field]).join(", ")} to settle`;
  }

  return "A term you put off is due again";
}

const FIELD_LABEL = { amount: "amount", cadence: "cadence", nextRenewal: "next renewal" } as const;
