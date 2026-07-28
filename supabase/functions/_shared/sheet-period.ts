export type SheetPeriodResolution =
  | { ok: true; periodId: string }
  | {
    ok: false;
    error:
      | "PERIOD_NOT_FOUND"
      | "SOURCE_PERIOD_CONFLICT"
      | "REQUEST_PERIOD_MISMATCH";
    periods: string[];
    requestedPeriodId?: string;
  };

export function resolveSheetPeriod(
  detectedPeriods: Iterable<string>,
  requestedPeriodId?: string,
): SheetPeriodResolution {
  const periods = [...new Set(detectedPeriods)].sort();
  if (periods.length === 0) {
    return { ok: false, error: "PERIOD_NOT_FOUND", periods };
  }
  if (periods.length > 1) {
    return { ok: false, error: "SOURCE_PERIOD_CONFLICT", periods };
  }
  if (requestedPeriodId && requestedPeriodId !== periods[0]) {
    return {
      ok: false,
      error: "REQUEST_PERIOD_MISMATCH",
      periods,
      requestedPeriodId,
    };
  }
  return { ok: true, periodId: periods[0] };
}
