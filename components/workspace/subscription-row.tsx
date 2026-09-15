"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import {
  entryAccountHint,
  entryAmountPreview,
  entryDateColumn,
  entryFilterContext,
  entryPlan,
  entryStatusText,
  rowElementId,
} from "@/lib/workspace/row-presentation";
import type { SubscriptionEntry } from "@/lib/workspace/subscription-list";
import type { WorkspaceFilter } from "@/lib/workspace/view";

/**
 * One subscription or draft as a closed row: identity, account when stored,
 * its own cost and independently labelled dates. The whole row opens or closes
 * through a link, so the open row is in the URL.
 */
export function SubscriptionRow({
  entry,
  filter,
  href,
  open,
}: {
  entry: SubscriptionEntry;
  filter: WorkspaceFilter;
  href: string;
  open: boolean;
}) {
  const rowRef = useRef<HTMLAnchorElement>(null);
  const wasOpen = useRef(open);
  const account = entryAccountHint(entry);
  const plan = entryPlan(entry);
  const status = entryStatusText(entry);
  const amount = entryAmountPreview(entry);
  const dates = entryDateColumn(entry);
  const line = entryFilterContext(entry, filter);
  const draft = entry.kind === "draft";
  const costSecondary = [
    amount.afterTrial ? "After trial" : null,
    amount.cadence,
  ]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (wasOpen.current && !open) {
      rowRef.current?.focus({ preventScroll: true });
    }

    wasOpen.current = open;
  }, [open]);

  return (
    <Link
      aria-current={open ? "true" : undefined}
      aria-expanded={open}
      className="workspace-row"
      href={href}
      id={rowElementId(entry.key)}
      ref={rowRef}
      scroll={false}
    >
      <span className="workspace-row-identity">
        <span className="workspace-row-name">{entry.provider}</span>
        <span className={`workspace-row-secondary${draft ? " workspace-row-draft" : ""}`}>
          {plan ? `${status} · ${plan}` : status}
        </span>
        {line ? <span className="workspace-row-secondary">{line}</span> : null}
      </span>
      <span className="workspace-row-account" title={account ?? undefined}>
        {account ? account : <span className="workspace-row-empty">&nbsp;</span>}
      </span>
      <span className="workspace-row-cost">
        <span className="workspace-row-price">
          {amount.amount ?? <span className="workspace-row-empty">Not recorded</span>}
        </span>
        {costSecondary ? <span className="workspace-row-secondary">{costSecondary}</span> : null}
        {amount.proposedDraft ? (
          <span className="workspace-row-secondary workspace-row-draft">Proposed draft</span>
        ) : null}
      </span>
      <span className="workspace-row-date">
        <span className="workspace-row-secondary">{dates.label}</span>
        <span className="workspace-row-date-value">
          {dates.value ?? <span className="workspace-row-empty">Not recorded</span>}
        </span>
        {dates.supporting ? (
          <span className="workspace-row-secondary workspace-row-recorded">
            {dates.supporting}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
