import { assertEquals } from "jsr:@std/assert@1";
import { deriveLeaderAwards } from "./leader.ts";
import type { NormalizedSheetRow } from "./sheet.ts";

function row(
  input:
    & Partial<NormalizedSheetRow>
    & Pick<NormalizedSheetRow, "sourceRowKey" | "sourceRowNumber">,
): NormalizedSheetRow {
  return {
    entityType: "team",
    entityCode: null,
    displayName: null,
    branchCode: null,
    teamCode: null,
    roleCode: null,
    sourceRank: null,
    sourceBoardCode: null,
    revenueVnd: null,
    displayRevenue: null,
    metrics: {},
    rawData: {},
    validationStatus: "ok",
    validationMessages: [],
    ...input,
  };
}

Deno.test("Leader uses only DS-TEAM GDTC XÉT BEST TEAM", () => {
  const result = deriveLeaderAwards([row({
    sourceRowKey: "team:1",
    sourceRowNumber: 1,
    entityCode: "u1",
    displayName: "Leader A",
    sourceBoardCode: "Phượng Hoàng",
    metrics: {
      leader_metric_candidate: 999_000_000,
      best_team_metric: 40_000_000,
    },
  })]);

  assertEquals(result.awards[0].tierCode, "LEADER_PHUONG_HOANG");
  assertEquals(result.awards[0].revenueVnd, 40_000_000);
  assertEquals(result.awards[0].boardSource, "manual");
  assertEquals(result.awards[0].metricSources, {
    "team:1": "best_team_metric",
  });
});

Deno.test("Leader sums column O by MNV across distinct teams", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:1",
      sourceRowNumber: 1,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "A",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 60_000_000 },
    }),
    row({
      sourceRowKey: "team:2",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: "LEADER A",
      teamCode: "B",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 10_000_000 },
    }),
  ]);

  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].revenueVnd, 70_000_000);
  assertEquals(result.candidates[0].teamCodes, ["A", "B"]);
  assertEquals(result.awards.length, 1);
  assertEquals(result.warnings.length, 0);
});

Deno.test("Leader blank Bảng Đấu is excluded without threshold fallback", () => {
  const result = deriveLeaderAwards([row({
    sourceRowKey: "team:1",
    sourceRowNumber: 1,
    entityCode: "U1",
    displayName: "Leader A",
    teamCode: "A",
    metrics: { best_team_metric: 600_000_000 },
  })]);

  assertEquals(result.candidates.length, 0);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings[0].code, "LEADER_BOARD_MISSING");
});

Deno.test("Leader conflicting Bảng Đấu is review-only and excluded", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:1",
      sourceRowNumber: 1,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "A",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 60_000_000 },
    }),
    row({
      sourceRowKey: "team:2",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "B",
      sourceBoardCode: "KY LAN",
      metrics: { best_team_metric: 50_000_000 },
    }),
  ]);

  assertEquals(result.candidates[0].revenueVnd, 110_000_000);
  assertEquals(result.candidates[0].tierCode, null);
  assertEquals(result.candidates[0].eligible, false);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings[0].code, "LEADER_BOARD_CONFLICT");
});

Deno.test("Leader zero metric is excluded even when manually assigned", () => {
  const result = deriveLeaderAwards([row({
    sourceRowKey: "team:1",
    sourceRowNumber: 1,
    entityCode: "U1",
    displayName: "Leader A",
    teamCode: "A",
    sourceBoardCode: "KY LAN",
    metrics: { best_team_metric: 0 },
  })]);

  assertEquals(result.candidates.length, 0);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings[0].code, "LEADER_METRIC_INVALID");
});

Deno.test("Leader missing metric is excluded even when another metric exists", () => {
  const result = deriveLeaderAwards([row({
    sourceRowKey: "team:1",
    sourceRowNumber: 1,
    entityCode: "U1",
    displayName: "Leader A",
    teamCode: "A",
    sourceBoardCode: "KY LAN",
    metrics: { leader_metric_candidate: 200_000_000 },
  })]);

  assertEquals(result.awards.length, 0);
  assertEquals(result.candidates.length, 0);
  assertEquals(result.warnings[0].code, "LEADER_METRIC_INVALID");
});

Deno.test("invalid metric rows do not contaminate a valid row of the same Leader", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:valid",
      sourceRowNumber: 1,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Valid",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 50_000_000 },
    }),
    row({
      sourceRowKey: "team:missing",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Missing",
      sourceBoardCode: "SU TU",
      metrics: {},
    }),
    row({
      sourceRowKey: "team:formula",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Formula",
      sourceBoardCode: "KY LAN",
      metrics: { best_team_metric: "#REF!" },
    }),
    row({
      sourceRowKey: "team:zero",
      sourceRowNumber: 4,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Zero",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 0 },
    }),
    row({
      sourceRowKey: "team:negative",
      sourceRowNumber: 5,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Negative",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: -1 },
    }),
  ]);

  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].revenueVnd, 50_000_000);
  assertEquals(result.candidates[0].teamCodes, ["Valid"]);
  assertEquals(result.candidates[0].sourceRowKeys, ["team:valid"]);
  assertEquals(result.awards.length, 1);
  assertEquals(
    result.warnings.filter((warning) =>
      warning.code === "LEADER_METRIC_INVALID"
    )
      .length,
    4,
  );
});

Deno.test("invalid board rows do not create a conflict for a valid Leader row", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:valid",
      sourceRowNumber: 1,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Valid",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 50 },
    }),
    row({
      sourceRowKey: "team:blank-board",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Blank",
      metrics: { best_team_metric: 40 },
    }),
    row({
      sourceRowKey: "team:wrong-board",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Wrong",
      sourceBoardCode: "THONG SOAI",
      metrics: { best_team_metric: 30 },
    }),
  ]);

  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].revenueVnd, 50);
  assertEquals(result.candidates[0].tierCode, "LEADER_SU_TU");
  assertEquals(result.candidates[0].eligible, true);
  assertEquals(result.awards.length, 1);
  assertEquals(
    result.warnings.some((warning) => warning.code === "LEADER_BOARD_CONFLICT"),
    false,
  );
  assertEquals(result.warnings.map((warning) => warning.code), [
    "LEADER_BOARD_MISSING",
    "LEADER_BOARD_INVALID",
  ]);
});

Deno.test("invalid identity and source-error rows do not contaminate a valid Leader", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:valid",
      sourceRowNumber: 1,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Valid",
      sourceBoardCode: "KY LAN",
      metrics: { best_team_metric: 200 },
    }),
    row({
      sourceRowKey: "team:no-name",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: null,
      teamCode: "No name",
      sourceBoardCode: "KY LAN",
      metrics: { best_team_metric: 100 },
    }),
    row({
      sourceRowKey: "team:source-error",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Error",
      sourceBoardCode: "KY LAN",
      metrics: { best_team_metric: 90 },
      validationStatus: "warning",
      validationMessages: ["Dòng nguồn có lỗi công thức"],
    }),
  ]);

  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].revenueVnd, 200);
  assertEquals(result.candidates[0].sourceRowKeys, ["team:valid"]);
  assertEquals(result.awards.length, 1);
  assertEquals(result.warnings.map((warning) => warning.code), [
    "LEADER_IDENTITY_MISSING",
    "LEADER_SOURCE_ROW_INVALID",
  ]);
});

Deno.test("Leader duplicate MNV and Team drops only the duplicate row", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:1",
      sourceRowNumber: 1,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "Alpha",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 10 },
    }),
    row({
      sourceRowKey: "team:2",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: "Leader A",
      teamCode: "alpha",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 10 },
    }),
  ]);

  assertEquals(result.candidates[0].revenueVnd, 10);
  assertEquals(result.awards.length, 1);
  assertEquals(result.awards[0].sourceRowKeys, ["team:1"]);
  assertEquals(result.warnings[0].code, "LEADER_TEAM_DUPLICATE");
});

Deno.test("same Leader MNV with different names is excluded", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:1",
      sourceRowNumber: 1,
      entityCode: "U1",
      displayName: "Nguyễn A",
      teamCode: "A",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 10 },
    }),
    row({
      sourceRowKey: "team:2",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: "Nguyễn B",
      teamCode: "B",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 20 },
    }),
  ]);

  assertEquals(result.awards.length, 0);
  assertEquals(result.candidates[0].eligible, false);
  assertEquals(
    result.warnings.some((warning) => warning.code === "LEADER_NAME_CONFLICT"),
    true,
  );
});

Deno.test("Leader ranking ties are deterministic by MNV", () => {
  const result = deriveLeaderAwards([
    row({
      sourceRowKey: "team:1",
      sourceRowNumber: 1,
      entityCode: "U2",
      displayName: "B",
      teamCode: "B",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 10 },
    }),
    row({
      sourceRowKey: "team:2",
      sourceRowNumber: 2,
      entityCode: "U1",
      displayName: "A",
      teamCode: "A",
      sourceBoardCode: "SU TU",
      metrics: { best_team_metric: 10 },
    }),
  ]);

  assertEquals(result.awards.map((award) => award.employeeCode), ["U1", "U2"]);
});
