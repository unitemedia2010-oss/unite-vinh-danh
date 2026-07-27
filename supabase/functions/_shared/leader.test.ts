import { deriveLeaderAwards } from "./leader.ts";
import type { NormalizedSheetRow } from "./sheet.ts";

function row(input: Partial<NormalizedSheetRow> & Pick<NormalizedSheetRow, "sourceRowKey" | "sourceRowNumber">): NormalizedSheetRow {
  return {
    entityType: "team", entityCode: null, displayName: null, branchCode: null,
    teamCode: null, roleCode: null, sourceRank: null, sourceBoardCode: null,
    revenueVnd: null, displayRevenue: null, metrics: {}, rawData: {},
    validationStatus: "ok", validationMessages: [], ...input,
  };
}

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

Deno.test("manual Leader board overrides revenue threshold and aliases accents", () => {
  const result = deriveLeaderAwards([row({
    sourceRowKey: "team:1", sourceRowNumber: 1, entityCode: "u1",
    displayName: "Leader A", sourceBoardCode: "Phượng Hoàng",
    metrics: { leader_metric_candidate: 52_000_000, best_team_metric: 40_000_000 },
  })]);
  assertEquals(result.awards[0].tierCode, "LEADER_PHUONG_HOANG");
  assertEquals(result.awards[0].revenueVnd, 52_000_000);
  assertEquals(result.awards[0].boardSource, "manual");
});

Deno.test("groups Leader by MNV and records explicit metric fallback", () => {
  const result = deriveLeaderAwards([
    row({ sourceRowKey: "team:1", sourceRowNumber: 1, entityCode: "U1", displayName: "Leader A", teamCode: "A", sourceBoardCode: "SU TU", metrics: { best_team_metric: 60_000_000 } }),
    row({ sourceRowKey: "team:2", sourceRowNumber: 2, entityCode: "U1", displayName: "LEADER A", teamCode: "B", sourceBoardCode: "SU TU", metrics: { leader_metric_candidate: 10_000_000, best_team_metric: 999_000_000 } }),
  ]);
  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].revenueVnd, 70_000_000);
  assertEquals(result.candidates[0].teamCodes, ["A", "B"]);
  assertEquals(result.warnings.some((warning) => warning.code === "LEADER_METRIC_FALLBACK"), true);
});

Deno.test("conflicting manual Leader boards use deterministic derived fallback and remain awarded", () => {
  const result = deriveLeaderAwards([
    row({ sourceRowKey: "team:1", sourceRowNumber: 1, entityCode: "U1", displayName: "Leader A", sourceBoardCode: "SU TU", metrics: { leader_metric_candidate: 60_000_000 } }),
    row({ sourceRowKey: "team:2", sourceRowNumber: 2, entityCode: "U1", displayName: "Leader A", sourceBoardCode: "KY LAN", metrics: { leader_metric_candidate: 50_000_000 } }),
  ]);
  assertEquals(result.awards[0].tierCode, "LEADER_PHUONG_HOANG");
  assertEquals(result.awards[0].needsReview, true);
  assertEquals(result.warnings[0].code, "LEADER_BOARD_CONFLICT");
});
