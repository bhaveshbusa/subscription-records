import { NOT_RECORDED } from "@/lib/fields/review";
import { isLifecycleKind, type ProposalPayload } from "@/lib/proposals/payload";
import type { ProposalView } from "@/lib/proposals/projection";
import {
  amountFieldLabel,
  autoRenewalLabel,
  cadenceFieldLabel,
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
} from "@/lib/subscriptions/format";
import type { FieldStatus, SubscriptionListItem } from "@/lib/subscriptions/projection";

/**
 * How a pending card is composed into the open row. Integration is visual
 * only: each proposal stays independently addressable. Pending terms on one
 * holding coalesce at write time (SUB-88); this helper only places cards.
 */
export type ProposalPresentation =
  | "create"
  | "terms"
  | "lifecycle"
  | "charge"
  | "restart"
  | "other";

export type DifferenceField =
  | "provider"
  | "plan"
  | "accountHint"
  | "status"
  | "amount"
  | "cadence"
  | "nextRenewal"
  | "trialEndsOn"
  | "autoRenewal"
  | "notes";

export type FieldDifference = {
  field: DifferenceField;
  /** Field name as it would appear on the saved record. */
  label: string;
  savedLabel: string;
  savedValue: string;
  savedHasValue: boolean;
  savedStatus: FieldStatus | null;
  proposedLabel: string;
  proposedValue: string;
  proposedHasValue: boolean;
  proposedStatus: FieldStatus;
};

const INLINE_TERMS_FIELDS = new Set<DifferenceField>([
  "amount",
  "cadence",
  "nextRenewal",
  "trialEndsOn",
  "autoRenewal",
  "plan",
  "provider",
  "status",
]);

const ANCHOR_ORDER: DifferenceField[] = [
  "amount",
  "cadence",
  "nextRenewal",
  "trialEndsOn",
  "autoRenewal",
  "plan",
  "provider",
  "status",
  "accountHint",
  "notes",
];

export function proposalPresentation(proposal: ProposalView): ProposalPresentation {
  if (proposal.payload?.charge) {
    return proposal.kind === "reactivated" ? "restart" : "charge";
  }

  if (isLifecycleKind(proposal.kind)) {
    return "lifecycle";
  }

  if (proposal.kind === "reactivated") {
    return "restart";
  }

  if (proposal.kind === "create") {
    return "create";
  }

  if (proposal.kind === "update" || proposal.kind === "terms_changed") {
    return "terms";
  }

  return "other";
}

/** Whether this card's deltas belong next to saved terms, not as a separate identity card. */
export function isInlineTermsProposal(proposal: ProposalView): boolean {
  const presentation = proposalPresentation(proposal);

  return presentation === "terms" && termDifferences(proposal, null).length > 0;
}

function display(value: string | null | undefined, hasValue: boolean): string {
  if (!hasValue || value == null || value.trim() === "" || value === "—") {
    return NOT_RECORDED;
  }

  return value;
}

function money(
  minor: number | null | undefined,
  currency: string | null | undefined,
): { text: string; hasValue: boolean } {
  if (minor == null) {
    return { text: NOT_RECORDED, hasValue: false };
  }

  return {
    text: formatMoneyMinor(minor, currency ?? "GBP"),
    hasValue: true,
  };
}

function holdingStatus(saved: SubscriptionListItem | null) {
  return saved?.status.value ?? "unknown";
}

/**
 * Proposed fields that this card would write, each with the current saved
 * value beside it. Unchanged saved fields are omitted — they stay on the
 * record. A draft has no saved side.
 */
export function termDifferences(
  proposal: Pick<ProposalView, "kind" | "payload">,
  saved: SubscriptionListItem | null,
): FieldDifference[] {
  const payload = proposal.payload;

  if (!payload || payload.charge || isLifecycleKind(proposal.kind)) {
    return [];
  }

  const draft = saved == null || proposal.kind === "create";
  const status = payload.subscriptionStatus?.value ?? holdingStatus(saved);
  const amountLabel = amountFieldLabel(status);
  const cadenceLabelText = cadenceFieldLabel(status);
  const proposedPrefix = draft ? "Proposed draft" : "Proposed";
  const savedPrefix = draft ? "Not yet added" : "Saved";
  const differences: FieldDifference[] = [];

  const push = (difference: Omit<FieldDifference, "savedLabel" | "proposedLabel">) => {
    differences.push({
      ...difference,
      savedLabel: `${savedPrefix} ${difference.label.toLowerCase()}`,
      proposedLabel: `${proposedPrefix} ${difference.label.toLowerCase()}`,
    });
  };

  if (payload.provider) {
    push({
      field: "provider",
      label: "Provider",
      savedValue: draft ? "Nothing saved" : display(saved?.provider.value, saved?.provider.value != null),
      savedHasValue: draft ? false : saved?.provider.value != null,
      savedStatus: saved?.provider.status ?? null,
      proposedValue: payload.provider.value,
      proposedHasValue: true,
      proposedStatus: payload.provider.status,
    });
  }

  if (payload.plan !== undefined) {
    push({
      field: "plan",
      label: "Plan",
      savedValue: draft ? "Nothing saved" : display(saved?.plan.value, saved?.plan.value != null),
      savedHasValue: draft ? false : saved?.plan.value != null,
      savedStatus: null,
      proposedValue: display(payload.plan, payload.plan != null),
      proposedHasValue: payload.plan != null && payload.plan !== "",
      proposedStatus: "proposed",
    });
  }

  if (payload.accountHint !== undefined) {
    push({
      field: "accountHint",
      label: "Account hint",
      savedValue: draft ? "Nothing saved" : display(saved?.accountHint, saved?.accountHint != null),
      savedHasValue: draft ? false : saved?.accountHint != null,
      savedStatus: null,
      proposedValue: display(payload.accountHint, payload.accountHint != null),
      proposedHasValue: payload.accountHint != null && payload.accountHint !== "",
      proposedStatus: "proposed",
    });
  }

  if (payload.subscriptionStatus) {
    push({
      field: "status",
      label: "Status",
      savedValue: draft ? "Nothing saved" : saved ? statusLabel(saved.status.value) : NOT_RECORDED,
      savedHasValue: draft ? false : saved != null,
      savedStatus: saved?.status.status ?? null,
      proposedValue: statusLabel(payload.subscriptionStatus.value),
      proposedHasValue: true,
      proposedStatus: payload.subscriptionStatus.status,
    });
  }

  if (payload.amountMinor) {
    const proposed = money(payload.amountMinor.value, payload.currency ?? saved?.amount.value?.currency);
    const recorded = money(saved?.amount.value?.minor ?? null, saved?.amount.value?.currency);

    push({
      field: "amount",
      label: amountLabel,
      savedValue: draft ? "Nothing saved" : recorded.text,
      savedHasValue: draft ? false : recorded.hasValue,
      savedStatus: saved?.amount.status ?? null,
      proposedValue: proposed.text,
      proposedHasValue: proposed.hasValue,
      proposedStatus: payload.amountMinor.status,
    });
  }

  if (payload.cadence) {
    push({
      field: "cadence",
      label: cadenceLabelText,
      savedValue: draft ? "Nothing saved" : cadenceLabel(saved?.cadence.value ?? null),
      savedHasValue: draft ? false : saved?.cadence.value != null,
      savedStatus: saved?.cadence.status ?? null,
      proposedValue: cadenceLabel(payload.cadence.value),
      proposedHasValue: true,
      proposedStatus: payload.cadence.status,
    });
  }

  if (payload.nextRenewal) {
    push({
      field: "nextRenewal",
      label: "Recorded renewal",
      savedValue: draft ? "Nothing saved" : formatDate(saved?.nextRenewal.value ?? null),
      savedHasValue: draft ? false : saved?.nextRenewal.value != null,
      savedStatus: saved?.nextRenewal.status ?? null,
      proposedValue: formatDate(payload.nextRenewal.value),
      proposedHasValue: payload.nextRenewal.value != null,
      proposedStatus: payload.nextRenewal.status,
    });
  }

  if (payload.trialEndsOn) {
    push({
      field: "trialEndsOn",
      label: "Trial ends on",
      savedValue: draft ? "Nothing saved" : formatDate(saved?.trialEndsOn.value ?? null),
      savedHasValue: draft ? false : saved?.trialEndsOn.value != null,
      savedStatus: saved?.trialEndsOn.status ?? null,
      proposedValue: formatDate(payload.trialEndsOn.value),
      proposedHasValue: payload.trialEndsOn.value != null,
      proposedStatus: payload.trialEndsOn.status,
    });
  }

  if (payload.autoRenewal) {
    push({
      field: "autoRenewal",
      label: "Auto-renewal",
      savedValue: draft ? "Nothing saved" : autoRenewalLabel(saved?.autoRenewal.value ?? null),
      savedHasValue: draft ? false : saved?.autoRenewal.value != null,
      savedStatus: saved?.autoRenewal.status ?? null,
      proposedValue: autoRenewalLabel(payload.autoRenewal.value),
      proposedHasValue: payload.autoRenewal.value != null,
      proposedStatus: payload.autoRenewal.status,
    });
  }

  if (payload.notes !== undefined) {
    push({
      field: "notes",
      label: "Notes",
      savedValue: NOT_RECORDED,
      savedHasValue: false,
      savedStatus: null,
      proposedValue: display(payload.notes, payload.notes != null),
      proposedHasValue: payload.notes != null && payload.notes !== "",
      proposedStatus: "proposed",
    });
  }

  if (draft && hasLedgerTerms(payload)) {
    const present = new Set(differences.map((difference) => difference.field));
    const emptyAmount = money(null, payload.currency);
    const fill = (
      field: DifferenceField,
      label: string,
      proposedValue: string,
      proposedHasValue: boolean,
    ) => {
      if (present.has(field)) {
        return;
      }

      push({
        field,
        label,
        savedValue: "Nothing saved",
        savedHasValue: false,
        savedStatus: null,
        proposedValue,
        proposedHasValue,
        proposedStatus: "empty",
      });
    };

    fill("amount", amountLabel, emptyAmount.text, false);
    fill("cadence", cadenceLabelText, NOT_RECORDED, false);
    fill("nextRenewal", "Recorded renewal", NOT_RECORDED, false);
  }

  return differences;
}

function hasLedgerTerms(payload: ProposalPayload) {
  return Boolean(
    payload.provider ||
      payload.amountMinor ||
      payload.cadence ||
      payload.nextRenewal ||
      payload.subscriptionStatus ||
      payload.trialEndsOn ||
      payload.autoRenewal,
  );
}

/** The saved field this proposal sits next to. First changed primary term wins. */
export function proposalAnchor(proposal: ProposalView): DifferenceField | null {
  const differences = termDifferences(proposal, null);

  for (const field of ANCHOR_ORDER) {
    if (differences.some((difference) => difference.field === field)) {
      return field;
    }
  }

  return null;
}

export function groupInlineProposals(proposals: ProposalView[]): {
  inline: Partial<Record<DifferenceField, ProposalView[]>>;
  rest: ProposalView[];
} {
  const inline: Partial<Record<DifferenceField, ProposalView[]>> = {};
  const rest: ProposalView[] = [];

  for (const proposal of proposals) {
    if (!isInlineTermsProposal(proposal)) {
      rest.push(proposal);
      continue;
    }

    const field = proposalAnchor(proposal);

    if (!field || !INLINE_TERMS_FIELDS.has(field)) {
      rest.push(proposal);
      continue;
    }

    inline[field] = [...(inline[field] ?? []), proposal];
  }

  return { inline, rest };
}

export function proposalKindHeading(proposal: ProposalView): string {
  switch (proposalPresentation(proposal)) {
    case "create":
      return "Proposed draft";
    case "terms":
      return proposal.kind === "terms_changed" ? "Pending terms change" : "Pending update";
    case "lifecycle":
      return proposal.kind === "cancel_scheduled"
        ? "Pending scheduled cancellation"
        : "Pending cancellation";
    case "charge":
      return "Pending charge";
    case "restart":
      return "Pending reactivation";
    default:
      return "Pending review";
  }
}
