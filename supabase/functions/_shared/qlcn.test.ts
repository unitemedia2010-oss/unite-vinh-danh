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

Deno.test("QLCN ranks every DS-KV region row independently without merging MNV", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:5:U177",
      sourceRowNumber: 5,
      entityCode: "u177",
      displayName: "Nguyen Thi Ha",
      branchCode: "DOC1",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 233_098_178 },
    }),
    row({
      sourceRowKey: "kv:9:U177",
      sourceRowNumber: 9,
      entityCode: "U177",
      displayName: "NGUYEN THI HA",
      branchCode: "DFC",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 65_685_300 },
    }),
  ], 10);

  assertEquals(result.candidates.length, 2);
  assertEquals(result.awards.length, 2);
  assertEquals(result.awards.map((award) => award.entityCode), [
    "U177",
    "U177",
  ]);
  assertEquals(result.awards.map((award) => award.rank), [1, 2]);
  assertEquals(result.awards.map((award) => award.regionCodes), [["DOC1"], [
    "DFC",
  ]]);
  assertEquals(result.awards.map((award) => award.revenueVnd), [
    233_098_178,
    65_685_300,
  ]);
  assertEquals(result.awards.map((award) => award.managerSourceRowKeys), [
    ["kv:5:U177"],
    ["kv:9:U177"],
  ]);
  assertEquals(result.warnings, []);
});

Deno.test("QLCN uses each row's valid Bang Dau and never derives a threshold tier", () => {
  const result = deriveQlcnAwards([row({
    sourceRowKey: "kv:3:U1",
    sourceRowNumber: 3,
    entityCode: "U1",
    displayName: "Quan ly A",
    branchCode: "LTC",
    sourceBoardCode: "TUONG QUAN",
    metrics: { manager_metric: 900_000_000 },
  })]);

  assertEquals(result.awards.length, 1);
  assertEquals(result.awards[0].tierCode, "QLCN_DAI_TUONG");
  assertEquals(result.awards[0].boardSource, "manual");
  assertEquals(result.awards[0].revenueVnd, 900_000_000);
});

Deno.test("QLCN missing Bang Dau excludes only that region row", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3:U177",
      sourceRowNumber: 3,
      entityCode: "U177",
      displayName: "Nguyen Thi Ha",
      branchCode: "DOC1",
      metrics: { manager_metric: 600_000_000 },
    }),
    row({
      sourceRowKey: "kv:4:U177",
      sourceRowNumber: 4,
      entityCode: "U177",
      displayName: "Nguyen Thi Ha",
      branchCode: "DFC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 100_000_000 },
    }),
  ]);

  assertEquals(result.candidates.length, 2);
  assertEquals(
    result.candidates.find((candidate) => candidate.regionCodes[0] === "DOC1")
      ?.eligible,
    false,
  );
  assertEquals(result.awards.length, 1);
  assertEquals(result.awards[0].regionCodes, ["DFC"]);
  assertEquals(result.warnings.map((warning) => warning.code), [
    "QLCN_BOARD_MISSING",
  ]);
});

Deno.test("QLCN invalid Bang Dau excludes only that row", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3:U1",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "Quan ly A",
      branchCode: "LTC",
      sourceBoardCode: "KY LAN",
      metrics: { manager_metric: 600_000_000 },
    }),
    row({
      sourceRowKey: "kv:4:U2",
      sourceRowNumber: 4,
      entityCode: "U2",
      displayName: "Quan ly B",
      branchCode: "MVC",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 500_000_000 },
    }),
  ]);

  assertEquals(result.awards.length, 1);
  assertEquals(result.awards[0].entityCode, "U2");
  assertEquals(result.warnings.map((warning) => warning.code), [
    "QLCN_BOARD_INVALID",
  ]);
});

Deno.test("QLCN excludes null, formula-error, zero, and negative metrics per row", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3:U1",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "A",
      branchCode: "R1",
      sourceBoardCode: "THONG SOAI",
      metrics: {},
    }),
    row({
      sourceRowKey: "kv:4:U2",
      sourceRowNumber: 4,
      entityCode: "U2",
      displayName: "B",
      branchCode: "R2",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: "#REF!" },
    }),
    row({
      sourceRowKey: "kv:5:U3",
      sourceRowNumber: 5,
      entityCode: "U3",
      displayName: "C",
      branchCode: "R3",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 0 },
    }),
    row({
      sourceRowKey: "kv:6:U4",
      sourceRowNumber: 6,
      entityCode: "U4",
      displayName: "D",
      branchCode: "R4",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: -1 },
    }),
    row({
      sourceRowKey: "kv:7:U5",
      sourceRowNumber: 7,
      entityCode: "U5",
      displayName: "E",
      branchCode: "R5",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 1 },
    }),
  ]);

  assertEquals(result.candidates.length, 5);
  assertEquals(
    result.candidates.filter((candidate) => candidate.eligible).length,
    1,
  );
  assertEquals(result.awards.map((award) => award.entityCode), ["U5"]);
  assertEquals(
    result.warnings.filter((warning) => warning.code === "QLCN_METRIC_INVALID")
      .length,
    4,
  );
});

Deno.test("QLCN source row validation errors do not contaminate another region", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3:U177",
      sourceRowNumber: 3,
      entityCode: "U177",
      displayName: "Nguyen Thi Ha",
      branchCode: "DOC1",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 90_000_000 },
      validationStatus: "warning",
      validationMessages: ["Dong nguon co loi cong thuc"],
    }),
    row({
      sourceRowKey: "kv:4:U177",
      sourceRowNumber: 4,
      entityCode: "U177",
      displayName: "Nguyen Thi Ha",
      branchCode: "DFC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 80_000_000 },
    }),
  ]);

  assertEquals(result.candidates[0].eligible, false);
  assertEquals(result.awards.length, 1);
  assertEquals(result.awards[0].regionCodes, ["DFC"]);
});

Deno.test("QLCN same MNV with different names remains row-scoped", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3:U1",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "Nguyen A",
      branchCode: "LTC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 2 },
    }),
    row({
      sourceRowKey: "kv:4:U1",
      sourceRowNumber: 4,
      entityCode: "U1",
      displayName: "Nguyen B",
      branchCode: "MVC",
      sourceBoardCode: "THU LINH",
      metrics: { manager_metric: 1 },
    }),
  ]);

  assertEquals(result.awards.length, 2);
  assertEquals(result.awards.map((award) => award.displayName), [
    "Nguyen A",
    "Nguyen B",
  ]);
  assertEquals(result.warnings, []);
});

Deno.test("QLCN ranking ties are deterministic by MNV then region", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3:U2",
      sourceRowNumber: 3,
      entityCode: "U2",
      displayName: "B",
      branchCode: "R2",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 10 },
    }),
    row({
      sourceRowKey: "kv:4:U1",
      sourceRowNumber: 4,
      entityCode: "U1",
      displayName: "A",
      branchCode: "R2",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 10 },
    }),
    row({
      sourceRowKey: "kv:5:U1",
      sourceRowNumber: 5,
      entityCode: "U1",
      displayName: "A",
      branchCode: "R1",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 10 },
    }),
  ]);

  assertEquals(
    result.awards.map((award) => `${award.entityCode}:${award.regionCodes[0]}`),
    ["U1:R1", "U1:R2", "U2:R2"],
  );
});

Deno.test("QLCN rank limit is applied independently to every Bang Dau", () => {
  const result = deriveQlcnAwards([
    row({
      sourceRowKey: "kv:3:U1",
      sourceRowNumber: 3,
      entityCode: "U1",
      displayName: "A",
      branchCode: "R1",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 10 },
    }),
    row({
      sourceRowKey: "kv:4:U2",
      sourceRowNumber: 4,
      entityCode: "U2",
      displayName: "B",
      branchCode: "R2",
      sourceBoardCode: "THONG SOAI",
      metrics: { manager_metric: 9 },
    }),
    row({
      sourceRowKey: "kv:5:U3",
      sourceRowNumber: 5,
      entityCode: "U3",
      displayName: "C",
      branchCode: "R3",
      sourceBoardCode: "TUONG QUAN",
      metrics: { manager_metric: 8 },
    }),
    row({
      sourceRowKey: "kv:6:U4",
      sourceRowNumber: 6,
      entityCode: "U4",
      displayName: "D",
      branchCode: "R4",
      sourceBoardCode: "TUONG QUAN",
      metrics: { manager_metric: 7 },
    }),
  ], 1);

  assertEquals(
    result.awards.map((award) => `${award.tierCode}:${award.entityCode}`),
    [
      "QLCN_THONG_SOAI:U1",
      "QLCN_DAI_TUONG:U3",
    ],
  );
});
