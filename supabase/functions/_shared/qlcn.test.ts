import { assertEquals } from "jsr:@std/assert@1";
import { deriveQlcnAwards } from "./qlcn.ts";
import type { NormalizedSheetRow } from "./sheet.ts";

function row(
  input:
    & Partial<NormalizedSheetRow>
    & Pick<NormalizedSheetRow, "sourceRowKey" | "sourceRowNumber">,
): NormalizedSheetRow {
  return {
    entityType: "branch_manager",
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

Deno.test("QLCN sums DS-KV TỔNG GDTC+HC Tn by MNV across regions", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:5",
      sourceRowNumber: 5,
      entityCode: "u177",
      displayName: "Nguyễn Thị Hà",
      branchCode: "DOC1",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 233_098_178 },
    }),
    row({
      sourceRowKey: "kv:9",
      sourceRowNumber: 9,
      entityCode: "U177",
      displayName: "NGUYỄN THỊ HÀ",
      branchCode: "DFC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 65_685_300 },
    }),
  ]);

  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].regionCodes, ["DFC", "DOC1"]);
  assertEquals(result.candidates[0].branchBreakdown, {
    DOC1: 233_098_178,
    DFC: 65_685_300,
  });
  assertEquals(result.candidates[0].revenueVnd, 298_783_478);
  assertEquals(result.awards[0].displayName, "Nguyễn Thị Hà");
  assertEquals(result.awards[0].tierCode, "QLCN_THU_LINH");
});

Deno.test("QLCN uses manual Bảng Đấu and never derives a threshold tier", () => {
  const result = deriveQlcnAwards([row({
    sourceRowKey: "kv:3",
    sourceRowNumber: 3,
    entityCode: "U1",
    displayName: "Quản lý A",
    branchCode: "LTC",
    sourceBoardCode: "TUONG QUAN",
    metrics: { manager_metric: 900_000_000 },
  })]);

  assertEquals(result.awards[0].tierCode, "QLCN_DAI_TUONG");
  assertEquals(result.awards[0].boardSource, "manual");
});

Deno.test("QLCN blank Bảng Đấu is review-only and excluded", () => {
  const result = deriveQlcnAwards([row({
    sourceRowKey: "kv:3",
    sourceRowNumber: 3,
    entityCode: "U1",
    displayName: "Quản lý A",
    branchCode: "LTC",
    metrics: { manager_metric: 600_000_000 },
  })]);

  assertEquals(result.candidates[0].tierCode, null);
  assertEquals(result.candidates[0].eligible, false);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings[0].code, "QLCN_BOARD_MISSING");
});

Deno.test("QLCN zero metric is valid when Bảng Đấu is assigned", () => {
  const result = deriveQlcnAwards([row({
    sourceRowKey: "kv:3",
    sourceRowNumber: 3,
    entityCode: "U1",
    displayName: "Quản lý A",
    branchCode: "LTC",
    sourceBoardCode: "THONG SOAI",
    metrics: { manager_metric: 0 },
  })]);

  assertEquals(result.awards.length, 1);
  assertEquals(result.awards[0].revenueVnd, 0);
  assertEquals(result.awards[0].needsReview, false);
});

Deno.test("QLCN missing metric is excluded even with a manual board", () => {
  const result = deriveQlcnAwards([row({
    sourceRowKey: "kv:3",
    sourceRowNumber: 3,
    entityCode: "U1",
    displayName: "Quản lý A",
    branchCode: "LTC",
    sourceBoardCode: "THONG SOAI",
    metrics: { other_metric: 900_000_000 },
  })]);

  assertEquals(result.awards.length, 0);
  assertEquals(result.candidates[0].eligible, false);
  assertEquals(result.warnings[0].code, "QLCN_METRIC_INVALID");
});

Deno.test("conflicting QLCN boards for duplicate MNV are excluded", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:5",
      sourceRowNumber: 5,
      entityCode: "U177",
      displayName: "Nguyễn Thị Hà",
      branchCode: "DOC1",
      sourceBoardCode: "TUONG QUAN",
      metrics: { manager_metric: 4_570_000 },
    }),
    row({
      sourceRowKey: "kv:9",
      sourceRowNumber: 9,
      entityCode: "U177",
      displayName: "NGUYỄN THỊ HÀ",
      branchCode: "DFC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 0 },
    }),
  ]);

  assertEquals(result.candidates[0].revenueVnd, 4_570_000);
  assertEquals(result.candidates[0].eligible, false);
  assertEquals(result.candidates[0].tierCode, null);
  assertEquals(result.awards.length, 0);
  assertEquals(
    result.warnings.some((warning) => warning.code === "QLCN_BOARD_CONFLICT"),
    true,
  );
});

Deno.test("same QLCN MNV with different names is excluded", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "Nguyễn A",
      branchCode: "LTC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 1 },
    }),
    row({
      sourceRowKey: "kv:4",
      sourceRowNumber: 4,
      entityCode: "U1",
      displayName: "Nguyễn B",
      branchCode: "MVC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 2 },
    }),
  ]);

  assertEquals(result.awards.length, 0);
  assertEquals(result.candidates[0].needsReview, true);
  assertEquals(
    result.warnings.some((warning) => warning.code === "QLCN_NAME_CONFLICT"),
    true,
  );
});

Deno.test("same QLCN MNV and region never double counts", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "Nguyễn A",
      branchCode: "LTC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 100 },
    }),
    row({
      sourceRowKey: "kv:4",
      sourceRowNumber: 4,
      entityCode: "U1",
      displayName: "Nguyễn A",
      branchCode: "ltc",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 100 },
    }),
  ]);

  assertEquals(result.candidates[0].revenueVnd, 100);
  assertEquals(result.awards.length, 0);
  assertEquals(
    result.warnings.some((warning) => warning.code === "QLCN_REGION_DUPLICATE"),
    true,
  );
});

Deno.test("QLCN ranking ties are deterministic by MNV", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3",
      sourceRowNumber: 3,
      entityCode: "U2",
      displayName: "B",
      branchCode: "R2",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 10 },
    }),
    row({
      sourceRowKey: "kv:4",
      sourceRowNumber: 4,
      entityCode: "U1",
      displayName: "A",
      branchCode: "R1",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 10 },
    }),
  ]);

  assertEquals(result.awards.map((award) => award.entityCode), ["U1", "U2"]);
});
