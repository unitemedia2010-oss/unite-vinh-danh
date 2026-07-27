import { formatVnd, type NormalizedSheetRow, normalizeText } from "./sheet.ts";
import {
  type BestTeamContribution,
  type BestTeamDerivation,
  type BestTeamWarning,
  deriveBestTeamContributions,
} from "./best-team.ts";

export const TEAM_DERIVATION_VERSION = "team-best-team-ranking-v1";

export type TeamAwardCandidate = BestTeamContribution & {
  entityCode: string;
  displayName: string;
  displayRevenue: string;
  needsReview: boolean;
  validationMessages: string[];
};

export type TeamAward = TeamAwardCandidate & { rank: number };

export type TeamAwardDerivation = {
  candidates: TeamAwardCandidate[];
  awards: TeamAward[];
  warnings: BestTeamWarning[];
};

export function deriveTeamAwardsFromContributions(
  bestTeam: BestTeamDerivation,
  rankLimit = 10,
): TeamAwardDerivation {
  const warnings: BestTeamWarning[] = [];
  const candidates = bestTeam.contributions
    .filter((contribution) => contribution.revenueVnd > 0)
    .map<TeamAwardCandidate>((contribution) => ({
      ...contribution,
      entityCode: `TEAM:${contribution.teamKey}`,
      displayName: contribution.teamCode,
      displayRevenue: formatVnd(contribution.revenueVnd) ?? "0 VNĐ",
      needsReview: false,
      validationMessages: [],
    }))
    .sort((left, right) =>
      right.revenueVnd - left.revenueVnd ||
      left.regionCode.localeCompare(right.regionCode, "en") ||
      normalizeText(left.teamCode).localeCompare(
        normalizeText(right.teamCode),
        "en",
      ) ||
      left.sourceRowNumber - right.sourceRowNumber
    );

  const byRevenue = new Map<number, TeamAwardCandidate[]>();
  for (const candidate of candidates) {
    const tied = byRevenue.get(candidate.revenueVnd) ?? [];
    tied.push(candidate);
    byRevenue.set(candidate.revenueVnd, tied);
  }
  for (const [revenueVnd, tied] of byRevenue.entries()) {
    if (tied.length < 2) continue;
    const message =
      "Nhiều Team có cùng GDTC XÉT BEST TEAM; thứ tự tạm dùng khu vực và mã Team.";
    tied.forEach((candidate) => {
      candidate.needsReview = true;
      candidate.validationMessages.push(message);
    });
    warnings.push({
      code: "TEAM_REVENUE_TIE",
      message,
      details: {
        revenueVnd,
        teamKeys: tied.map((candidate) => candidate.teamKey),
      },
    });
  }

  const awards = candidates
    .slice(0, Math.max(0, rankLimit))
    .map<TeamAward>((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return { candidates, awards, warnings };
}

export function deriveTeamAwards(
  teamRows: NormalizedSheetRow[],
  rankLimit = 10,
): TeamAwardDerivation {
  const bestTeam = deriveBestTeamContributions(teamRows);
  const result = deriveTeamAwardsFromContributions(bestTeam, rankLimit);
  return { ...result, warnings: [...bestTeam.warnings, ...result.warnings] };
}
