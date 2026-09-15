import type { WorkspaceFilter } from "./view";

const EMPTY_COPY: Record<WorkspaceFilter, { title: string; body: string }> = {
  all: {
    title: "No subscriptions yet.",
    body: "Capture one above — a line of text, a pasted list, a screenshot or a voice note — and it appears here for review.",
  },
  reviews: {
    title: "Nothing to review.",
    body: "New captures and proposed changes to what you hold wait here until you accept or reject them.",
  },
  questions: {
    title: "No open questions.",
    body: "When a capture needs something settled, the question sits here until you answer it or put it off.",
  },
  reminders: {
    title: "No reminders due.",
    body: "A reminder shows from its reminder date until the renewal or trial end it is for.",
  },
};

/**
 * Empty-list copy for a filter or a search miss. Loading is a separate visible
 * status so a first paint is never mistaken for zero results.
 */
export function emptyListCopy(
  filter: WorkspaceFilter,
  query = "",
): { title: string; body: string } {
  if (query.trim()) {
    return {
      title: "No matching subscriptions.",
      body: "Nothing in this list matches that search. Clear the search to see every row again.",
    };
  }

  return EMPTY_COPY[filter];
}
