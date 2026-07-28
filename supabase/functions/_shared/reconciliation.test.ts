import { assertEquals } from "jsr:@std/assert@1";
import { reconcileRecognitionSourceTotals } from "./reconciliation.ts";
import type { NormalizedSheetRow } from "./sheet.ts";

function row(metrics: Record<string, unknown>): NormalizedSheetRow {
  return {
    sourceRowKey: crypto.randomUUID(),
    sourceRowNumber: 1,
    entityType: "other",
    entityCode: null,
    displayName: null,
    branchCode: null,
    teamCode: null,
    roleCode: null,
    sourceRank: null,
    sourceBoardCode: null,
    revenueVnd: null,
    displayRevenue: null,
    metrics,
    rawData: {},
    validationStatus: "ok",
    validationMessages: [],
  };
}

Deno.test("source reconciliation accepts matching totals including zero", () => {
  const result = reconcileRecognitionSourceTotals(
    [row({ manager_metric: 0 }), row({ manager_metric: 58_710_000 })],
    [
      row({ best_team_metric: 10_000_000 }),
      row({ best_team_metric: 48_710_000 }),
    ],
  );

  assertEquals(result.managerMetricTotalVnd, 58_710_000);
  assertEquals(result.bestTeamMetricTotalVnd, 58_710_000);
  assertEquals(result.differenceVnd, 0);
  assertEquals(result.warning, null);
});

Deno.test("source reconciliation emits an exact difference warning", () => {
  const result = reconcileRecognitionSourceTotals(
    [row({ manager_metric: 60_000_000 })],
    [row({ best_team_metric: 58_710_000 })],
  );

  assertEquals(result.differenceVnd, 1_290_000);
  assertEquals(result.warning?.code, "SOURCE_TOTAL_MISMATCH");
  assertEquals(result.warning?.managerMetricTotalVnd, 60_000_000);
  assertEquals(result.warning?.bestTeamMetricTotalVnd, 58_710_000);
});
