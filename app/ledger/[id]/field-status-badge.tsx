import { fieldStatusLabel } from "@/lib/subscriptions/format";
import type { FieldStatus } from "@/lib/subscriptions/projection";

const TONE: Record<FieldStatus, string> = {
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  inferred: "border-sky-200 bg-sky-50 text-sky-800",
  proposed: "border-violet-200 bg-violet-50 text-violet-800",
  deferred: "border-stone-200 bg-stone-100 text-stone-600",
  empty: "border-stone-200 bg-stone-50 text-stone-500",
  conflicted: "border-amber-300 bg-amber-50 text-amber-900",
};

export function FieldStatusBadge({ status }: { status: FieldStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[status]}`}
    >
      {fieldStatusLabel(status)}
    </span>
  );
}
