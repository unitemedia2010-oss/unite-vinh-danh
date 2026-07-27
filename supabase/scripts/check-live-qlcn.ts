import { deriveBestTeamContributions } from "../functions/_shared/best-team.ts";
import { deriveQlcnAwardsFromContributions } from "../functions/_shared/qlcn.ts";
import { deriveTeamAwardsFromContributions } from "../functions/_shared/team.ts";
import { deriveLeaderAwards } from "../functions/_shared/leader.ts";
import {
  fetchPublicSheetCsv,
  normalizeSheetRows,
  parseInteger,
  type SheetMapping,
} from "../functions/_shared/sheet.ts";

const spreadsheetId = Deno.args[0] ??
  "1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM";

const managerMapping: SheetMapping = {
  id: "live-ds-kv",
  code: "DS_KV",
  entity_type: "branch_manager",
  sheet_name: "DS-KV",
  range_a1: "B1:N20",
  title_row: 1,
  header_row: 2,
  data_start_row: 3,
  column_map: {
    source_rank: { exact: "STT" },
    branch_code: { exact: "KHU VỰC" },
    display_name: { exact: "QLCN" },
    entity_code: { exact: "MNV" },
    source_board_code: { exact: "BẢNG ĐẤU", prefix: "BẢNG ĐẤU" },
    role_code: { exact: "CẤP BẬC" },
  },
  filter_config: { numericRankOnly: true, skipBlankName: true },
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
    source_board_code: { exact: "BẢNG ĐẤU", prefix: "BẢNG ĐẤU" },
    leader_metric_candidate: { exact: "GDTC TÍNH TN" },
    role_code: { exact: "CẤP BẬC" },
    branch_code: { exact: "KHU VỰC" },
    best_team_metric: { exact: "GDTC XÉT BEST TEAM" },
  },
  filter_config: {
    numericRankOnly: true,
    skipBlankName: false,
    selectedRevenueField: "best_team_metric",
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
const qlcn = deriveQlcnAwardsFromContributions(managers.rows, bestTeam, 3);
const team = deriveTeamAwardsFromContributions(bestTeam, 10);
const leader = deriveLeaderAwards(teams.rows, 10);
const totalBestTeamVnd = teams.rows.reduce(
  (sum, row) => sum + (parseInteger(row.metrics.best_team_metric) ?? 0),
  0,
);
const validTeamContributionVnd = bestTeam.contributions.reduce(
  (sum, contribution) => sum + contribution.revenueVnd,
  0,
);
const assignedToManagersVnd = qlcn.candidates.reduce(
  (sum, candidate) => sum + candidate.revenueVnd,
  0,
);

console.log(JSON.stringify(
  {
    spreadsheetId,
    period: managers.periodId ?? teams.periodId,
    sourceRows: { managers: managers.rows.length, teams: teams.rows.length },
    reconciliation: {
      totalBestTeamVnd,
      validTeamContributionVnd,
      excludedFromTeamRankingVnd: totalBestTeamVnd - validTeamContributionVnd,
      assignedToManagersVnd,
      unassignedFromQlcnVnd: totalBestTeamVnd - assignedToManagersVnd,
      validButUnassignedToQlcnVnd: validTeamContributionVnd -
        assignedToManagersVnd,
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
