import { deriveTeamAwards } from "./team.ts";
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

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("uses the Team code as the award display name, not the leader name", () => {
  const result = deriveTeamAwards([
    row({
      sourceRowKey: "team:money",
      sourceRowNumber: 4,
      entityCode: "U966",
      displayName: "Trần Xuân Hoa",
      branchCode: "TBC",
      teamCode: "MONEY",
      roleCode: "QLTEAM",
      metrics: { best_team_metric: 119_530_778 },
    }),
  ]);

  assertEquals(result.awards.length, 1);
  assertEquals(result.awards[0].displayName, "MONEY");
  assertEquals(result.awards[0].leaderName, "Trần Xuân Hoa");
  assertEquals(result.awards[0].leaderCode, "U966");
  assertEquals(result.awards[0].entityCode, "TEAM:TBC:MONEY");
});

Deno.test("excludes a Team row with no region and returns an audit warning", () => {
  const result = deriveTeamAwards([
    row({
      sourceRowKey: "team:pkd",
      sourceRowNumber: 45,
      entityCode: "U100",
      displayName: "Trưởng nhóm hỗ trợ",
      branchCode: null,
      teamCode: "PKD",
      metrics: { best_team_metric: 69_486_881 },
    }),
  ]);

  assertEquals(result.candidates.length, 0);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings.map((warning) => warning.code), [
    "TEAM_REGION_MISSING",
  ]);
  assertEquals(result.warnings[0].details, {
    sourceRow: 45,
    teamCode: "PKD",
    revenueVnd: 69_486_881,
  });
});

Deno.test("treats the same Team code in different regions as distinct Teams", () => {
  const result = deriveTeamAwards([
    row({
      sourceRowKey: "team:ctc:theviper",
      sourceRowNumber: 12,
      branchCode: "CTC",
      teamCode: "THEVIPER",
      metrics: { best_team_metric: 40_000_000 },
    }),
    row({
      sourceRowKey: "team:btc1:theviper",
      sourceRowNumber: 22,
      branchCode: "BTC1",
      teamCode: "THEVIPER",
      metrics: { best_team_metric: 60_000_000 },
    }),
  ]);

  assertEquals(result.warnings.length, 0);
  assertEquals(
    result.awards.map((award) => ({
      rank: award.rank,
      teamKey: award.teamKey,
      entityCode: award.entityCode,
      revenueVnd: award.revenueVnd,
    })),
    [
      {
        rank: 1,
        teamKey: "BTC1:THEVIPER",
        entityCode: "TEAM:BTC1:THEVIPER",
        revenueVnd: 60_000_000,
      },
      {
        rank: 2,
        teamKey: "CTC:THEVIPER",
        entityCode: "TEAM:CTC:THEVIPER",
        revenueVnd: 40_000_000,
      },
    ],
  );
});

Deno.test("excludes every duplicate row for the same normalized region and Team", () => {
  const result = deriveTeamAwards([
    row({
      sourceRowKey: "team:doc1:fusion:1",
      sourceRowNumber: 8,
      branchCode: "doc1",
      teamCode: "Fusion",
      metrics: { best_team_metric: 47_000_000 },
    }),
    row({
      sourceRowKey: "team:doc1:fusion:2",
      sourceRowNumber: 9,
      branchCode: " DOC1 ",
      teamCode: " FUSION ",
      metrics: { best_team_metric: 47_334_593 },
    }),
  ]);

  assertEquals(result.candidates.length, 0);
  assertEquals(result.awards.length, 0);
  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].code, "TEAM_REGION_DUPLICATE");
  assertEquals(result.warnings[0].details, {
    teamKey: "DOC1:FUSION",
    sourceRows: [8, 9],
    revenueValues: [47_000_000, 47_334_593],
  });
});

Deno.test("ranks by Best Team revenue, ignores zero revenue, and respects rankLimit", () => {
  const result = deriveTeamAwards([
    row({
      sourceRowKey: "team:a",
      sourceRowNumber: 4,
      branchCode: "R1",
      teamCode: "A",
      metrics: { best_team_metric: 30 },
    }),
    row({
      sourceRowKey: "team:b",
      sourceRowNumber: 5,
      branchCode: "R2",
      teamCode: "B",
      metrics: { best_team_metric: 10 },
    }),
    row({
      sourceRowKey: "team:c",
      sourceRowNumber: 6,
      branchCode: "R3",
      teamCode: "C",
      metrics: { best_team_metric: 20 },
    }),
    row({
      sourceRowKey: "team:zero",
      sourceRowNumber: 7,
      branchCode: "R4",
      teamCode: "ZERO",
      metrics: { best_team_metric: 0 },
    }),
  ], 2);

  assertEquals(result.candidates.map((candidate) => candidate.displayName), [
    "A",
    "C",
    "B",
  ]);
  assertEquals(
    result.awards.map((award) => ({
      rank: award.rank,
      name: award.displayName,
      revenue: award.revenueVnd,
    })),
    [
      { rank: 1, name: "A", revenue: 30 },
      { rank: 2, name: "C", revenue: 20 },
    ],
  );
});

Deno.test("orders an exact revenue tie deterministically and marks every tied Team for review", () => {
  const result = deriveTeamAwards([
    row({
      sourceRowKey: "team:zzz:b",
      sourceRowNumber: 20,
      branchCode: "ZZZ",
      teamCode: "B",
      metrics: { best_team_metric: 50_000_000 },
    }),
    row({
      sourceRowKey: "team:aaa:z",
      sourceRowNumber: 30,
      branchCode: "AAA",
      teamCode: "Z",
      metrics: { best_team_metric: 50_000_000 },
    }),
    row({
      sourceRowKey: "team:aaa:a",
      sourceRowNumber: 40,
      branchCode: "AAA",
      teamCode: "A",
      metrics: { best_team_metric: 50_000_000 },
    }),
  ]);

  assertEquals(result.awards.map((award) => award.teamKey), [
    "AAA:A",
    "AAA:Z",
    "ZZZ:B",
  ]);
  assertEquals(result.awards.map((award) => award.rank), [1, 2, 3]);
  assert(
    result.awards.every((award) => award.needsReview),
    "Every exactly tied Team must require review",
  );
  assertEquals(result.awards.map((award) => award.validationMessages.length), [
    1,
    1,
    1,
  ]);
  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].code, "TEAM_REVENUE_TIE");
  assertEquals(result.warnings[0].details, {
    revenueVnd: 50_000_000,
    teamKeys: ["AAA:A", "AAA:Z", "ZZZ:B"],
  });
});

Deno.test("matches the confirmed live-like Top 3 MONEY, FUSION, and ZENITH", () => {
  const result = deriveTeamAwards([
    row({
      sourceRowKey: "team:money",
      sourceRowNumber: 4,
      entityCode: "U966",
      displayName: "Trần Xuân Hoa",
      branchCode: "TBC",
      teamCode: "MONEY",
      metrics: { best_team_metric: 119_530_778 },
    }),
    row({
      sourceRowKey: "team:fusion",
      sourceRowNumber: 5,
      entityCode: "U382",
      displayName: "Phạm Vũ Thư",
      branchCode: "DOC1",
      teamCode: "FUSION",
      metrics: { best_team_metric: 94_334_593 },
    }),
    row({
      sourceRowKey: "team:zenith",
      sourceRowNumber: 6,
      entityCode: "U553",
      displayName: "Nguyễn Thị Cẩm Giang",
      branchCode: "CTC",
      teamCode: "ZENITH",
      metrics: { best_team_metric: 87_308_667 },
    }),
    row({
      sourceRowKey: "team:fast",
      sourceRowNumber: 7,
      entityCode: "U884",
      displayName: "Đồng Tiến Quân",
      branchCode: "ATC",
      teamCode: "FAST",
      metrics: { best_team_metric: 80_430_944 },
    }),
  ], 3);

  assertEquals(
    result.awards.map((award) => ({
      rank: award.rank,
      displayName: award.displayName,
      leaderName: award.leaderName,
      regionCode: award.regionCode,
      revenueVnd: award.revenueVnd,
    })),
    [
      {
        rank: 1,
        displayName: "MONEY",
        leaderName: "Trần Xuân Hoa",
        regionCode: "TBC",
        revenueVnd: 119_530_778,
      },
      {
        rank: 2,
        displayName: "FUSION",
        leaderName: "Phạm Vũ Thư",
        regionCode: "DOC1",
        revenueVnd: 94_334_593,
      },
      {
        rank: 3,
        displayName: "ZENITH",
        leaderName: "Nguyễn Thị Cẩm Giang",
        regionCode: "CTC",
        revenueVnd: 87_308_667,
      },
    ],
  );
  assertEquals(result.warnings, []);
});
