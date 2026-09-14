"use client";

import { fieldStatusLabel } from "@/lib/subscriptions/format";
import type { FieldStatus } from "@/lib/subscriptions/projection";

export function FieldStatusBadge({ status }: { status: FieldStatus }) {
  return (
    <span
      className={`ui-status ui-status--${status}`}
    >
      {fieldStatusLabel(status)}
    </span>
  );
}
