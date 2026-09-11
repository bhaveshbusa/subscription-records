import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import type { InboxQuestion, InboxReminder, InboxSections } from "./query";

/**
 * Work, grouped by the holding it is about.
 *
 * The projected sections answer separate questions of the ledger, so one row
 * can be in more than one of them — a holding whose stored date has passed and
 * whose amount conflicts is both overdue and unfinished. Rendering the sections
 * as they arrive shows that holding twice, each copy with its own actions, and
 * the same pending operation then looks like two.
 *
 * Grouping keeps one card per holding carrying every reason it is here, and
 * folds each open question onto the holding it belongs to. Nothing is dropped:
 * the reasons are listed, the questions stay individually answerable, and a
 * question about no particular holding keeps its own place.
 */

export type WorkReason = "overdue" | "unfinished";

export type WorkGroup = {
  subscriptionId: string;
  item: SubscriptionListItem;
  /** Every reason this holding is work, in the order the sections are read. */
  reasons: WorkReason[];
  questions: InboxQuestion[];
};

export type WorkQueue = {
  groups: WorkGroup[];
  /** Open questions that name no holding, or name one that is not work. */
  questions: InboxQuestion[];
  reminders: InboxReminder[];
  /** Distinct pieces of work waiting: one per holding, plus loose questions. */
  count: number;
};

const REASON_ORDER: WorkReason[] = ["overdue", "unfinished"];

export function workQueue(sections: InboxSections): WorkQueue {
  const groups = new Map<string, WorkGroup>();

  for (const reason of REASON_ORDER) {
    for (const item of reason === "overdue" ? sections.overdue : sections.unfinished) {
      const group = groups.get(item.id);

      if (group) {
        if (!group.reasons.includes(reason)) {
          group.reasons.push(reason);
        }

        continue;
      }

      groups.set(item.id, {
        subscriptionId: item.id,
        item,
        reasons: [reason],
        questions: [],
      });
    }
  }

  const questions: InboxQuestion[] = [];

  for (const question of sections.questions) {
    const group = question.subscriptionId
      ? groups.get(question.subscriptionId)
      : undefined;

    if (group) {
      group.questions.push(question);
    } else {
      questions.push(question);
    }
  }

  return {
    groups: [...groups.values()],
    questions,
    reminders: sections.reminders,
    count: groups.size + questions.length,
  };
}

/** The reasons a card carries, in the words the card shows. */
export function reasonLabel(reason: WorkReason): string {
  return reason === "overdue" ? "Needs reconciling" : "Unsettled";
}

/**
 * The one question to show prominently: the oldest still-asked question, so
 * the prominent slot does not move to whichever question was asked last.
 */
export function nextQuestionId(queue: WorkQueue): string | null {
  const asked = [
    ...queue.questions,
    ...queue.groups.flatMap((group) => group.questions),
  ].filter((question) => question.state === "asked");

  if (asked.length === 0) {
    return null;
  }

  return asked.reduce((oldest, question) =>
    question.updatedAt < oldest.updatedAt ? question : oldest,
  ).id;
}
