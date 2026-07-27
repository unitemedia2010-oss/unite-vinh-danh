import { deriveQlcnAwards } from "./qlcn.ts";
import type { NormalizedSheetRow } from "./sheet.ts";

function row(input: Partial<NormalizedSheetRow> & Pick<NormalizedSheetRow, "sourceRowKey" | "sourceRowNumber">): NormalizedSheetRow {
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

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

Deno.test("merges DOC1 and DFC for the same QLCN before assigning a tier", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", entityCode: "U177", displayName: "Nguyễn Thị Hà", branchCode: "DOC1" }),
    row({ sourceRowKey: "kv:4", sourceRowNumber: 4, entityType: "branch_manager", entityCode: "U177", displayName: "Nguyễn Thị Hà", branchCode: "DFC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "DOC1", teamCode: "A", metrics: { best_team_metric: 220_000_000 } }),
    row({ sourceRowKey: "team:5", sourceRowNumber: 5, branchCode: "DFC", teamCode: "B", metrics: { best_team_metric: 310_000_000 } }),
  ];

  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].regionCodes, ["DFC", "DOC1"]);
  assertEquals(result.candidates[0].branchBreakdown, { DOC1: 220_000_000, DFC: 310_000_000 });
  assertEquals(result.candidates[0].revenueVnd, 530_000_000);
  assertEquals(result.candidates[0].displayRevenue, "530.000.000 VNĐ");
  assertEquals(result.candidates[0].tierCode, "QLCN_THONG_SOAI");
  assertEquals(result.awards[0].rank, 1);
});

Deno.test("matches the confirmed live example for Nguyen Thi Ha", () => {
  const managers = [
    row({ sourceRowKey: "kv:5", sourceRowNumber: 5, entityType: "branch_manager", entityCode: "u177", displayName: "Nguyễn Thị Hà", branchCode: "DOC1" }),
    row({ sourceRowKey: "kv:11", sourceRowNumber: 11, entityType: "branch_manager", entityCode: "U177", displayName: "NGUYỄN THỊ HÀ", branchCode: "DFC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:doc1", sourceRowNumber: 10, branchCode: "DOC1", teamCode: "DOC-A", metrics: { best_team_metric: 233_098_178 } }),
    row({ sourceRowKey: "team:dfc", sourceRowNumber: 31, branchCode: "DFC", teamCode: "DFC-A", metrics: { best_team_metric: 65_685_300 } }),
  ];

  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.candidates[0].entityCode, "U177");
  assertEquals(result.candidates[0].branchBreakdown, { DOC1: 233_098_178, DFC: 65_685_300 });
  assertEquals(result.candidates[0].revenueVnd, 298_783_478);
  assertEquals(result.candidates[0].tierCode, "QLCN_THU_LINH");
  assertEquals(result.awards[0].rank, 1);
  assertEquals(result.awards[0].needsReview, false);
});

Deno.test("sums every team in one region exactly once", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", entityCode: "U1", displayName: "Quản lý A", branchCode: "LTC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "LTC", teamCode: "A", metrics: { best_team_metric: 120_000_000 } }),
    row({ sourceRowKey: "team:5", sourceRowNumber: 5, branchCode: "LTC", teamCode: "B", metrics: { best_team_metric: 190_000_000 } }),
  ];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.candidates[0].revenueVnd, 310_000_000);
  assertEquals(result.candidates[0].tierCode, "QLCN_DAI_TUONG");
});

Deno.test("does not double count an ambiguous region owner", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", entityCode: "U1", displayName: "Quản lý A", branchCode: "LTC" }),
    row({ sourceRowKey: "kv:4", sourceRowNumber: 4, entityType: "branch_manager", entityCode: "U2", displayName: "Quản lý B", branchCode: "LTC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "LTC", teamCode: "LTC-A", metrics: { best_team_metric: 600_000_000 } }),
  ];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.candidates.map((candidate) => candidate.revenueVnd), [0, 0]);
  assertEquals(result.warnings[0].code, "REGION_MANAGER_AMBIGUOUS");
  assertEquals(result.candidates.every((candidate) => candidate.needsReview), true);
  assertEquals(result.awards.length, 0);
});

Deno.test("never falls back to another revenue field", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", entityCode: "U1", displayName: "Quản lý A", branchCode: "LTC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "LTC", teamCode: "LTC-A", revenueVnd: 800_000_000, metrics: {} }),
  ];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.candidates[0].revenueVnd, 0);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings[0].code, "BEST_TEAM_METRIC_MISSING");
});

Deno.test("excludes duplicate branch and team rows instead of double counting", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", entityCode: "U1", displayName: "Quản lý A", branchCode: "LTC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "LTC", teamCode: "A", metrics: { best_team_metric: 200_000_000 } }),
    row({ sourceRowKey: "team:5", sourceRowNumber: 5, branchCode: "LTC", teamCode: "a", metrics: { best_team_metric: 200_000_000 } }),
  ];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.candidates[0].revenueVnd, 0);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings[0].code, "TEAM_REGION_DUPLICATE");
});

Deno.test("assigns exact QLCN tier boundaries", () => {
  const values = [299_999_999, 300_000_000, 499_999_999, 500_000_000];
  const managers = values.map((_, index) => row({
    sourceRowKey: `kv:${index}`,
    sourceRowNumber: index + 3,
    entityType: "branch_manager",
    entityCode: `U${index}`,
    displayName: `Quản lý ${index}`,
    branchCode: `R${index}`,
  }));
  const teams = values.map((value, index) => row({
    sourceRowKey: `team:${index}`,
    sourceRowNumber: index + 4,
    branchCode: `R${index}`,
    teamCode: `T${index}`,
    metrics: { best_team_metric: value },
  }));
  const result = deriveQlcnAwards(managers, teams);
  const byCode = Object.fromEntries(result.candidates.map((candidate) => [candidate.entityCode, candidate.tierCode]));
  assertEquals(byCode, {
    U3: "QLCN_THONG_SOAI",
    U2: "QLCN_DAI_TUONG",
    U1: "QLCN_DAI_TUONG",
    U0: "QLCN_THU_LINH",
  });
});

Deno.test("rejects a negative Best Team contribution", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", entityCode: "U1", displayName: "Quản lý A", branchCode: "LTC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "LTC", teamCode: "A", metrics: { best_team_metric: -1 } }),
  ];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.warnings[0].code, "BEST_TEAM_METRIC_NEGATIVE");
  assertEquals(result.candidates[0].needsReview, true);
  assertEquals(result.awards.length, 0);
});

Deno.test("never merges QLCN by display name when MNV is missing", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", displayName: "Cùng Tên", branchCode: "LTC" }),
    row({ sourceRowKey: "kv:4", sourceRowNumber: 4, entityType: "branch_manager", displayName: "Cùng Tên", branchCode: "MVC" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "LTC", teamCode: "A", metrics: { best_team_metric: 100_000_000 } }),
    row({ sourceRowKey: "team:5", sourceRowNumber: 5, branchCode: "MVC", teamCode: "B", metrics: { best_team_metric: 200_000_000 } }),
  ];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.candidates.length, 0);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings.filter((warning) => warning.code === "MANAGER_CODE_MISSING").length, 2);
});

Deno.test("one valid manual QLCN board overrides the revenue threshold", () => {
  const managers = [row({
    sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager",
    entityCode: "U1", displayName: "Quản lý A", branchCode: "LTC",
    sourceBoardCode: "TƯỚNG QUÂN",
  })];
  const teams = [row({
    sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "LTC",
    teamCode: "A", metrics: { best_team_metric: 600_000_000 },
  })];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.awards[0].tierCode, "QLCN_DAI_TUONG");
  assertEquals(result.awards[0].boardSource, "manual");
});

Deno.test("conflicting manual QLCN boards fall back to revenue and remain reviewable award", () => {
  const managers = [
    row({ sourceRowKey: "kv:3", sourceRowNumber: 3, entityType: "branch_manager", entityCode: "U177", displayName: "Nguyễn Thị Hà", branchCode: "DOC1", sourceBoardCode: "TUONG QUAN" }),
    row({ sourceRowKey: "kv:4", sourceRowNumber: 4, entityType: "branch_manager", entityCode: "U177", displayName: "NGUYỄN THỊ HÀ", branchCode: "DFC", sourceBoardCode: "THU LINH" }),
  ];
  const teams = [
    row({ sourceRowKey: "team:3", sourceRowNumber: 3, branchCode: "DOC1", teamCode: "A", metrics: { best_team_metric: 220_000_000 } }),
    row({ sourceRowKey: "team:4", sourceRowNumber: 4, branchCode: "DFC", teamCode: "B", metrics: { best_team_metric: 65_000_000 } }),
  ];
  const result = deriveQlcnAwards(managers, teams);
  assertEquals(result.awards[0].entityCode, "U177");
  assertEquals(result.awards[0].tierCode, "QLCN_THU_LINH");
  assertEquals(result.awards[0].needsReview, true);
  assertEquals(result.warnings.some((warning) => warning.code === "QLCN_BOARD_CONFLICT"), true);
});
