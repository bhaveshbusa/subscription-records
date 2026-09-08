import { monthlyEquivalentMinor } from "./projection";

/**
 * Current paid commitments: still held and currently billed. Trials are free
 * until the user continues; paused, unknown, and cancelled rows are not this
 * total. `cancel_scheduled` still bills through the paid period.
 */
export const PAID_COMMITMENT_STATUSES = ["active", "cancel_scheduled"] as const;

export const PAID_COMMITMENT_LABEL =
  "Recorded GBP paid-commitment monthly equivalent";

export type CoverageFacts = {
  id: string;
  provider_display: string;
  status: string;
  amount_minor: number | null;
  currency: string;
  cadence: "weekly" | "monthly" | "yearly" | null;
  amount_field_status: string;
  cadence_field_status: string;
};

export type CoverageRef = {
  subscriptionId: string;
  provider: string;
};

export type CoverageBucket =
  | "confirmed"
  | "unconfirmed"
  | "omitted_missing"
  | "omitted_currency"
  | "after_trial_stated"
  | "after_trial_unknown"
  | "outside";

export type CoverageBreakdown = {
  confirmed: { count: number; monthlyEquivalentMinor: number };
  unconfirmed: {
    count: number;
    monthlyEquivalentMinor: number;
    items: CoverageRef[];
  };
  omitted: {
    missingPriceOrCadence: { count: number; items: CoverageRef[] };
    excludedCurrency: {
      count: number;
      items: Array<CoverageRef & { currency: string }>;
    };
  };
  afterTrial: {
    monthlyEquivalentMinor: number;
    stated: {
      count: number;
      items: Array<CoverageRef & { monthlyEquivalentMinor: number }>;
    };
    unknownPrice: { count: number; items: CoverageRef[] };
  };
};

function byProvider<T extends CoverageRef>(items: T[]): T[] {
  return [...items].sort((a, b) => a.provider.localeCompare(b.provider));
}

export function isPaidCommitmentStatus(
  status: string,
): status is (typeof PAID_COMMITMENT_STATUSES)[number] {
  return (PAID_COMMITMENT_STATUSES as readonly string[]).includes(status);
}

export function isCalculableGbp(row: Pick<CoverageFacts, "amount_minor" | "cadence" | "currency">) {
  return row.currency === "GBP" && row.amount_minor !== null && row.cadence !== null;
}

/**
 * Confirmed coverage needs confirmed amount and confirmed cadence on a settled
 * holding. `unknown` is not settled. Conflicted amount or cadence is not
 * confirmed even when a figure is stored.
 */
export function isConfirmedCoverage(row: CoverageFacts) {
  return (
    isPaidCommitmentStatus(row.status) &&
    row.status !== "unknown" &&
    isCalculableGbp(row) &&
    row.amount_field_status === "confirmed" &&
    row.cadence_field_status === "confirmed"
  );
}

export function classifyCoverage(row: CoverageFacts): CoverageBucket {
  if (row.status === "trial") {
    return isCalculableGbp(row) ? "after_trial_stated" : "after_trial_unknown";
  }

  if (!isPaidCommitmentStatus(row.status)) {
    return "outside";
  }

  if (row.currency !== "GBP") {
    return "omitted_currency";
  }

  if (row.amount_minor === null || row.cadence === null) {
    return "omitted_missing";
  }

  return isConfirmedCoverage(row) ? "confirmed" : "unconfirmed";
}

export function emptyCoverageBreakdown(): CoverageBreakdown {
  return {
    confirmed: { count: 0, monthlyEquivalentMinor: 0 },
    unconfirmed: { count: 0, monthlyEquivalentMinor: 0, items: [] },
    omitted: {
      missingPriceOrCadence: { count: 0, items: [] },
      excludedCurrency: { count: 0, items: [] },
    },
    afterTrial: {
      monthlyEquivalentMinor: 0,
      stated: { count: 0, items: [] },
      unknownPrice: { count: 0, items: [] },
    },
  };
}

export function summariseCoverage(rows: CoverageFacts[]): CoverageBreakdown {
  const coverage = emptyCoverageBreakdown();

  for (const row of rows) {
    const bucket = classifyCoverage(row);
    const equivalent = monthlyEquivalentMinor(row.amount_minor, row.cadence);
    const ref: CoverageRef = {
      subscriptionId: row.id,
      provider: row.provider_display,
    };

    switch (bucket) {
      case "confirmed":
        coverage.confirmed.count += 1;
        coverage.confirmed.monthlyEquivalentMinor += equivalent ?? 0;
        break;
      case "unconfirmed":
        coverage.unconfirmed.count += 1;
        coverage.unconfirmed.monthlyEquivalentMinor += equivalent ?? 0;
        coverage.unconfirmed.items.push(ref);
        break;
      case "omitted_missing":
        coverage.omitted.missingPriceOrCadence.items.push(ref);
        break;
      case "omitted_currency":
        coverage.omitted.excludedCurrency.items.push({ ...ref, currency: row.currency });
        break;
      case "after_trial_stated":
        coverage.afterTrial.stated.items.push({
          ...ref,
          monthlyEquivalentMinor: equivalent ?? 0,
        });
        coverage.afterTrial.monthlyEquivalentMinor += equivalent ?? 0;
        break;
      case "after_trial_unknown":
        coverage.afterTrial.unknownPrice.items.push(ref);
        break;
      case "outside":
        break;
    }
  }

  coverage.omitted.missingPriceOrCadence.count =
    coverage.omitted.missingPriceOrCadence.items.length;
  coverage.omitted.excludedCurrency.count = coverage.omitted.excludedCurrency.items.length;
  coverage.afterTrial.stated.count = coverage.afterTrial.stated.items.length;
  coverage.afterTrial.unknownPrice.count = coverage.afterTrial.unknownPrice.items.length;
  coverage.unconfirmed.items = byProvider(coverage.unconfirmed.items);
  coverage.omitted.missingPriceOrCadence.items = byProvider(
    coverage.omitted.missingPriceOrCadence.items,
  );
  coverage.omitted.excludedCurrency.items = byProvider(coverage.omitted.excludedCurrency.items);
  coverage.afterTrial.stated.items = byProvider(coverage.afterTrial.stated.items);
  coverage.afterTrial.unknownPrice.items = byProvider(coverage.afterTrial.unknownPrice.items);

  return coverage;
}

export function paidCommitmentMonthlyEquivalentMinor(coverage: CoverageBreakdown) {
  return (
    coverage.confirmed.monthlyEquivalentMinor + coverage.unconfirmed.monthlyEquivalentMinor
  );
}
