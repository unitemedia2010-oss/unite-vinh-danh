import { type NormalizedSheetRow, parseInteger } from "./sheet.ts";

export type RecognitionSourceReconciliation = {
  managerMetricTotalVnd: number;
  bestTeamMetricTotalVnd: number;
  differenceVnd: number;
  warning: {
    code: "SOURCE_TOTAL_MISMATCH";
    message: string;
    managerMetricTotalVnd: number;
    bestTeamMetricTotalVnd: number;
    differenceVnd: number;
  } | null;
};

function sumValidMetric(rows: NormalizedSheetRow[], field: string): number {
  return rows.reduce((sum, row) => {
    const value = parseInteger(row.metrics[field]);
    return value !== null && value >= 0 ? sum + value : sum;
  }, 0);
}

export function reconcileRecognitionSourceTotals(
  managerRows: NormalizedSheetRow[],
  teamRows: NormalizedSheetRow[],
): RecognitionSourceReconciliation {
  const managerMetricTotalVnd = sumValidMetric(
    managerRows,
    "manager_metric",
  );
  const bestTeamMetricTotalVnd = sumValidMetric(
    teamRows,
    "best_team_metric",
  );
  const differenceVnd = managerMetricTotalVnd - bestTeamMetricTotalVnd;
  const warning = differenceVnd === 0 ? null : {
    code: "SOURCE_TOTAL_MISMATCH" as const,
    message: "Tổng DS-KV.TỔNG GDTC+HC Tn khác tổng DS-TEAM.GDTC XÉT BEST TEAM.",
    managerMetricTotalVnd,
    bestTeamMetricTotalVnd,
    differenceVnd,
  };
  return {
    managerMetricTotalVnd,
    bestTeamMetricTotalVnd,
    differenceVnd,
    warning,
  };
}
