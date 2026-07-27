import {
  type NormalizedSheetRow,
  normalizeText,
  parseInteger,
} from "./sheet.ts";

export const BEST_TEAM_CONTRIBUTION_VERSION = "best-team-region-team-v1";

export type BestTeamWarning = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type BestTeamContribution = {
  teamKey: string;
  regionCode: string;
  teamCode: string;
  leaderCode: string | null;
  leaderName: string | null;
  roleCode: string | null;
  revenueVnd: number;
  sourceRowKey: string;
  sourceRowNumber: number;
};

export type BestTeamDerivation = {
  contributions: BestTeamContribution[];
  warnings: BestTeamWarning[];
};

export function normalizeBestTeamCode(value: string | null): string | null {
  const code = normalizeText(value).replace(/\s+/g, "");
  return code || null;
}

export function deriveBestTeamContributions(
  teamRows: NormalizedSheetRow[],
): BestTeamDerivation {
  const warnings: BestTeamWarning[] = [];
  const grouped = new Map<string, BestTeamContribution[]>();

  for (const row of teamRows) {
    const regionCode = normalizeBestTeamCode(row.branchCode);
    const revenueVnd = parseInteger(row.metrics.best_team_metric);
    if (!regionCode) {
      warnings.push({
        code: "TEAM_REGION_MISSING",
        message:
          "Dòng team thiếu mã khu vực nên không được tính Best Team hoặc QLCN.",
        details: {
          sourceRow: row.sourceRowNumber,
          teamCode: row.teamCode,
          revenueVnd,
        },
      });
      continue;
    }
    if (revenueVnd === null) {
      warnings.push({
        code: "BEST_TEAM_METRIC_MISSING",
        message: "Dòng team thiếu GDTC XÉT BEST TEAM.",
        details: {
          sourceRow: row.sourceRowNumber,
          teamCode: row.teamCode,
          region: regionCode,
        },
      });
      continue;
    }
    if (revenueVnd < 0) {
      warnings.push({
        code: "BEST_TEAM_METRIC_NEGATIVE",
        message: "GDTC XÉT BEST TEAM âm nên dòng chưa được tính.",
        details: {
          sourceRow: row.sourceRowNumber,
          teamCode: row.teamCode,
          region: regionCode,
          revenueVnd,
        },
      });
      continue;
    }
    const normalizedTeamCode = normalizeBestTeamCode(row.teamCode);
    if (!normalizedTeamCode) {
      warnings.push({
        code: "TEAM_CODE_MISSING",
        message:
          "Dòng có khu vực nhưng thiếu mã Team nên chưa được tính để tránh trùng.",
        details: {
          sourceRow: row.sourceRowNumber,
          region: regionCode,
          revenueVnd,
        },
      });
      continue;
    }

    const teamKey = `${regionCode}:${normalizedTeamCode}`;
    const contribution: BestTeamContribution = {
      teamKey,
      regionCode,
      teamCode: row.teamCode?.trim() || normalizedTeamCode,
      leaderCode: row.entityCode?.trim().toUpperCase() || null,
      leaderName: row.displayName?.trim() || null,
      roleCode: row.roleCode?.trim() || null,
      revenueVnd,
      sourceRowKey: row.sourceRowKey,
      sourceRowNumber: row.sourceRowNumber,
    };
    const entries = grouped.get(teamKey) ?? [];
    entries.push(contribution);
    grouped.set(teamKey, entries);
  }

  const contributions: BestTeamContribution[] = [];
  for (const [teamKey, entries] of grouped.entries()) {
    if (entries.length > 1) {
      warnings.push({
        code: "TEAM_REGION_DUPLICATE",
        message:
          "Cùng Team xuất hiện nhiều lần trong một khu vực; toàn bộ dòng trùng chưa được tính.",
        details: {
          teamKey,
          sourceRows: entries.map((entry) => entry.sourceRowNumber),
          revenueValues: entries.map((entry) => entry.revenueVnd),
        },
      });
      continue;
    }
    contributions.push(entries[0]);
  }

  return { contributions, warnings };
}
