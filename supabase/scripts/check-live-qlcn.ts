import { deriveBestTeamContributions } from "../functions/_shared/best-team.ts";
import { deriveQlcnAwards } from "../functions/_shared/qlcn.ts";
import { deriveTeamAwardsFromContributions } from "../functions/_shared/team.ts";
import { deriveLeaderAwards } from "../functions/_shared/leader.ts";
import { reconcileRecognitionSourceTotals } from "../functions/_shared/reconciliation.ts";
import {
  fetchPublicSheetCsv,
  normalizeSheetRows,
  type SheetMapping,
} from "../functions/_shared/sheet.ts";

const spreadsheetId = Deno.args[0] ??
  "1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM";

const managerMapping: SheetMapping = {
  id: "live-ds-kv",
  code: "DS_KV",
  entity_type: "branch_manager",
  sheet_name: "DS-KV",
  range_a1: "B1:N1000",
  title_row: 1,
  header_row: 2,
  data_start_row: 3,
  column_map: {
    source_rank: { exact: "STT" },
    branch_code: { exact: "KHU VỰC" },
    display_name: { exact: "QLCN" },
    entity_code: { exact: "MNV" },
    source_board_code: {
      exact: "BẢNG ĐẤU",
      prefix: "BẢNG ĐẤU",
      columnIndex: 12,
    },
    role_code: { exact: "CẤP BẬC" },
    // DS-KV is fetched as B:N, so accounting column L is index 10.
    manager_metric: { prefix: "TỔNG GDTC+HC T", columnIndex: 10 },
  },
  filter_config: {
    numericRankOnly: true,
    skipBlankName: false,
    selectedRevenueField: "manager_metric",
    periodColumnField: "manager_metric",
    requiredUniqueColumns: ["manager_metric", "source_board_code"],
  },
};

const teamMapping: SheetMapping = {
  id: "live-ds-team",
  code: "DS_TEAM",
  entity_type: "team",
  sheet_name: "DS-TEAM",
  range_a1: "B1:S1000",
  title_row: 1,
  header_row: 2,
  data_start_row: 3,
  column_map: {
    source_rank: { exact: "STT" },
    team_code: { exact: "TEAM" },
    display_name: { exact: "LEADER" },
    entity_code: { exact: "MNV" },
    source_board_code: {
      exact: "BẢNG ĐẤU",
      prefix: "BẢNG ĐẤU",
      columnIndex: 17,
    },
    role_code: { exact: "CẤP BẬC" },
    branch_code: { exact: "KHU VỰC" },
    // DS-TEAM is fetched as B:S: accounting column O is index 13 and the
    // month-bearing TỔNG GDTC+HC column N is index 12.
    best_team_metric: { exact: "GDTC XÉT BEST TEAM", columnIndex: 13 },
    total_gdtc_hc_metric: { prefix: "TỔNG GDTC+HC T", columnIndex: 12 },
  },
  filter_config: {
    numericRankOnly: true,
    skipBlankName: false,
    selectedRevenueField: "best_team_metric",
    periodColumnField: "total_gdtc_hc_metric",
    requiredUniqueColumns: [
      "best_team_metric",
      "total_gdtc_hc_metric",
      "source_board_code",
    ],
  },
};

const [managerMatrix, teamMatrix] = await Promise.all([
  fetchPublicSheetCsv(
    spreadsheetId,
    managerMapping.sheet_name,
    managerMapping.range_a1,
    managerMapping.header_row,
  ),
  fetchPublicSheetCsv(
    spreadsheetId,
    teamMapping.sheet_name,
    teamMapping.range_a1,
    teamMapping.header_row,
  ),
]);
const managers = normalizeSheetRows(managerMatrix, managerMapping);
const teams = normalizeSheetRows(teamMatrix, teamMapping);
const bestTeam = deriveBestTeamContributions(teams.rows);
const qlcn = deriveQlcnAwards(managers.rows, 3);
const team = deriveTeamAwardsFromContributions(bestTeam, 10);
const leader = deriveLeaderAwards(teams.rows, 10);
const sourceReconciliation = reconcileRecognitionSourceTotals(
  managers.rows,
  teams.rows,
);
const { managerMetricTotalVnd: totalManagerMetricVnd } = sourceReconciliation;
const { bestTeamMetricTotalVnd: totalBestTeamVnd } = sourceReconciliation;
const validTeamContributionVnd = bestTeam.contributions.reduce(
  (sum, contribution) => sum + contribution.revenueVnd,
  0,
);
const assignedToManagersVnd = qlcn.candidates.filter((candidate) =>
  candidate.eligible
).reduce(
  (sum, candidate) => sum + candidate.revenueVnd,
  0,
);

console.log(JSON.stringify(
  {
    spreadsheetId,
    period: managers.periodId ?? teams.periodId,
    sourceRows: { managers: managers.rows.length, teams: teams.rows.length },
    derivationCounts: {
      namedManagerRows: managers.rows.filter((row) =>
        Boolean(row.entityCode && row.displayName)
      ).length,
      qlcnCandidates: qlcn.candidates.length,
      qlcnEligible: qlcn.candidates.filter((candidate) =>
        candidate.eligible
      )
        .length,
      qlcnAwards: qlcn.awards.length,
      leaderCandidates: leader.candidates.length,
      leaderEligible:
        leader.candidates.filter((candidate) => candidate.eligible).length,
      leaderAwards: leader.awards.length,
      teamCandidates: team.candidates.length,
      teamAwards: team.awards.length,
    },
    sourceHeaders: {
      managers: managers.headers,
      teams: teams.headers,
    },
    blockingErrors: [...managers.blockingErrors, ...teams.blockingErrors],
    reconciliation: {
      totalManagerMetricVnd,
      totalBestTeamVnd,
      sourceDifferenceVnd: totalManagerMetricVnd - totalBestTeamVnd,
      validTeamContributionVnd,
      excludedFromTeamRankingVnd: totalBestTeamVnd - validTeamContributionVnd,
      assignedToManagersVnd,
      unassignedFromQlcnVnd: totalManagerMetricVnd - assignedToManagersVnd,
    },
    parserWarnings: [...managers.warnings, ...teams.warnings],
    candidates: qlcn.candidates.map((candidate) => ({
      employeeCode: candidate.entityCode,
      name: candidate.displayName,
      regions: candidate.regionCodes,
      branchBreakdown: candidate.branchBreakdown,
      revenueVnd: candidate.revenueVnd,
      displayRevenue: candidate.displayRevenue,
      tierCode: candidate.tierCode,
      needsReview: candidate.needsReview,
      validationMessages: candidate.validationMessages,
    })),
    awards: qlcn.awards.map((award) => ({
      tierCode: award.tierCode,
      rank: award.rank,
      employeeCode: award.entityCode,
      name: award.displayName,
      regions: award.regionCodes,
      revenueVnd: award.revenueVnd,
      displayRevenue: award.displayRevenue,
      needsReview: award.needsReview,
    })),
    teamAwards: team.awards.map((award) => ({
      rank: award.rank,
      team: award.displayName,
      leaderCode: award.leaderCode,
      leaderName: award.leaderName,
      region: award.regionCode,
      revenueVnd: award.revenueVnd,
      displayRevenue: award.displayRevenue,
      needsReview: award.needsReview,
    })),
    leaderAwards: leader.awards.map((award) => ({
      tierCode: award.tierCode,
      rank: award.rank,
      employeeCode: award.employeeCode,
      name: award.displayName,
      teams: award.teamCodes,
      revenueVnd: award.revenueVnd,
      displayRevenue: award.displayRevenue,
      boardSource: award.boardSource,
      needsReview: award.needsReview,
    })),
    warnings: [
      ...bestTeam.warnings,
      ...qlcn.warnings,
      ...team.warnings,
      ...leader.warnings,
    ],
  },
  null,
  2,
));
