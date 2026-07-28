import { isLeaderBoardCode, normalizeManualBoardCode } from "./board-code.ts";
import {
  formatVnd,
  type NormalizedSheetRow,
  normalizeText,
  parseInteger,
} from "./sheet.ts";

export const LEADER_DERIVATION_VERSION =
  "leader-ds-team-best-team-manual-board-v2";

export type LeaderTierCode =
  | "LEADER_SU_TU"
  | "LEADER_PHUONG_HOANG"
  | "LEADER_KY_LAN";

export type LeaderWarning = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type LeaderCandidate = {
  employeeCode: string;
  displayName: string;
  roleCode: string | null;
  branchCodes: string[];
  teamCodes: string[];
  revenueVnd: number;
  displayRevenue: string;
  tierCode: LeaderTierCode | null;
  boardSource: "manual" | "none";
  eligible: boolean;
  needsReview: boolean;
  validationMessages: string[];
  sourceRowKeys: string[];
  metricSources: Record<string, "best_team_metric">;
};

export type LeaderAward = LeaderCandidate & {
  tierCode: LeaderTierCode;
  rank: number;
};

export type LeaderDerivation = {
  candidates: LeaderCandidate[];
  awards: LeaderAward[];
  warnings: LeaderWarning[];
};

function cleanCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return code && /^[A-Z0-9_-]+$/.test(code) ? code : null;
}

/**
 * Leader membership is manually assigned in DS-TEAM.BẢNG ĐẤU. Ranking is the
 * sum of DS-TEAM.GDTC XÉT BEST TEAM (column O) for that MNV. Blank/conflicting
 * board values and invalid metrics are excluded instead of silently deriving a
 * tier from thresholds or another revenue column.
 */
export function deriveLeaderAwards(
  rows: NormalizedSheetRow[],
  rankLimit = 10,
): LeaderDerivation {
  const warnings: LeaderWarning[] = [];
  type MutableLeader = {
    employeeCode: string;
    displayName: string;
    roleCode: string | null;
    branchCodes: Set<string>;
    teamCodes: Set<string>;
    revenueVnd: number;
    manualBoards: Set<LeaderTierCode>;
    eligible: boolean;
    needsReview: boolean;
    validationMessages: string[];
    sourceRowKeys: string[];
    metricSources: Record<string, "best_team_metric">;
  };
  const leaders = new Map<string, MutableLeader>();

  for (const row of rows) {
    const employeeCode = cleanCode(row.entityCode);
    if (!employeeCode || !row.displayName) {
      warnings.push({
        code: "LEADER_IDENTITY_MISSING",
        message: "Dòng Leader thiếu MNV hoặc họ tên nên chưa thể vinh danh.",
        details: {
          sourceRow: row.sourceRowNumber,
          employeeCode,
          displayName: row.displayName,
        },
      });
      continue;
    }

    const messages = [...row.validationMessages];
    const rawBoard = row.sourceBoardCode?.trim() ?? "";
    const normalizedBoard = normalizeManualBoardCode(rawBoard);
    const manualBoard = normalizedBoard && isLeaderBoardCode(normalizedBoard)
      ? normalizedBoard
      : null;
    if (!rawBoard) {
      const message =
        "Leader chưa có Bảng Đấu; không tự suy luận bảng từ doanh số.";
      messages.push(message);
      warnings.push({
        code: "LEADER_BOARD_MISSING",
        message,
        details: { sourceRow: row.sourceRowNumber, employeeCode },
      });
    } else if (!manualBoard) {
      const message = `Bảng Đấu Leader không hợp lệ: ${rawBoard}.`;
      messages.push(message);
      warnings.push({
        code: "LEADER_BOARD_INVALID",
        message,
        details: {
          sourceRow: row.sourceRowNumber,
          employeeCode,
          value: rawBoard,
        },
      });
    }

    const metric = parseInteger(row.metrics.best_team_metric);
    if (metric === null || metric < 0) {
      const message =
        "Leader thiếu GDTC XÉT BEST TEAM hợp lệ; dòng bị loại khỏi bảng vinh danh.";
      messages.push(message);
      warnings.push({
        code: "LEADER_METRIC_INVALID",
        message,
        details: {
          sourceRow: row.sourceRowNumber,
          employeeCode,
          value: row.metrics.best_team_metric,
        },
      });
    }

    const existing = leaders.get(employeeCode);
    if (!existing) {
      leaders.set(employeeCode, {
        employeeCode,
        displayName: row.displayName,
        roleCode: row.roleCode,
        branchCodes: new Set(
          row.branchCode ? [row.branchCode.trim().toUpperCase()] : [],
        ),
        teamCodes: new Set(row.teamCode ? [row.teamCode.trim()] : []),
        revenueVnd: metric !== null && metric >= 0 ? metric : 0,
        manualBoards: new Set(manualBoard ? [manualBoard] : []),
        eligible: messages.length === 0 && Boolean(manualBoard),
        needsReview: messages.length > 0 || !manualBoard,
        validationMessages: messages,
        sourceRowKeys: [row.sourceRowKey],
        metricSources: { [row.sourceRowKey]: "best_team_metric" },
      });
      continue;
    }

    if (
      normalizeText(existing.displayName) !== normalizeText(row.displayName)
    ) {
      const message = "Cùng MNV Leader nhưng họ tên không đồng nhất.";
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(message);
      warnings.push({
        code: "LEADER_NAME_CONFLICT",
        message,
        details: {
          employeeCode,
          sourceRow: row.sourceRowNumber,
          names: [existing.displayName, row.displayName],
        },
      });
    }
    if (
      existing.roleCode && row.roleCode &&
      normalizeText(existing.roleCode) !== normalizeText(row.roleCode)
    ) {
      const message = "Cùng MNV Leader nhưng cấp bậc không đồng nhất.";
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(message);
      warnings.push({
        code: "LEADER_ROLE_CONFLICT",
        message,
        details: { employeeCode, sourceRow: row.sourceRowNumber },
      });
    }
    const teamCode = row.teamCode?.trim() ?? "";
    if (
      teamCode &&
      [...existing.teamCodes].some((value) =>
        normalizeText(value) === normalizeText(teamCode)
      )
    ) {
      const message =
        `MNV ${employeeCode} bị lặp Team ${teamCode}; không cộng trùng doanh số.`;
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(message);
      warnings.push({
        code: "LEADER_TEAM_DUPLICATE",
        message,
        details: { employeeCode, teamCode, sourceRow: row.sourceRowNumber },
      });
    } else {
      if (teamCode) existing.teamCodes.add(teamCode);
      if (metric !== null && metric >= 0) existing.revenueVnd += metric;
    }
    if (row.branchCode) {
      existing.branchCodes.add(row.branchCode.trim().toUpperCase());
    }
    if (manualBoard) existing.manualBoards.add(manualBoard);
    existing.sourceRowKeys.push(row.sourceRowKey);
    existing.metricSources[row.sourceRowKey] = "best_team_metric";
    if (messages.length) {
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(...messages);
    }
  }

  const candidates = [...leaders.values()].map<LeaderCandidate>((leader) => {
    let tierCode: LeaderTierCode | null = null;
    let boardSource: LeaderCandidate["boardSource"] = "none";
    if (leader.manualBoards.size === 1) {
      tierCode = [...leader.manualBoards][0];
      boardSource = "manual";
    } else if (leader.manualBoards.size > 1) {
      const values = [...leader.manualBoards].sort();
      const message =
        `MNV ${leader.employeeCode} có Bảng Đấu Leader mâu thuẫn (${
          values.join(", ")
        }); đã loại khỏi kết quả.`;
      leader.eligible = false;
      leader.needsReview = true;
      leader.validationMessages.push(message);
      warnings.push({
        code: "LEADER_BOARD_CONFLICT",
        message,
        details: { employeeCode: leader.employeeCode, values },
      });
    }
    if (!tierCode) leader.eligible = false;
    return {
      employeeCode: leader.employeeCode,
      displayName: leader.displayName,
      roleCode: leader.roleCode,
      branchCodes: [...leader.branchCodes].sort(),
      teamCodes: [...leader.teamCodes].sort((a, b) =>
        normalizeText(a).localeCompare(normalizeText(b), "en")
      ),
      revenueVnd: leader.revenueVnd,
      displayRevenue: formatVnd(leader.revenueVnd) ?? "0 VNĐ",
      tierCode,
      boardSource,
      eligible: leader.eligible,
      needsReview: leader.needsReview,
      validationMessages: [...new Set(leader.validationMessages)],
      sourceRowKeys: [...new Set(leader.sourceRowKeys)],
      metricSources: leader.metricSources,
    };
  }).sort((left, right) =>
    right.revenueVnd - left.revenueVnd ||
    left.employeeCode.localeCompare(right.employeeCode, "en") ||
    left.displayName.localeCompare(right.displayName, "vi")
  );

  const awards: LeaderAward[] = [];
  for (
    const tierCode of [
      "LEADER_KY_LAN",
      "LEADER_PHUONG_HOANG",
      "LEADER_SU_TU",
    ] as LeaderTierCode[]
  ) {
    candidates
      .filter((candidate): candidate is LeaderCandidate & {
        tierCode: LeaderTierCode;
      } => candidate.eligible && candidate.tierCode === tierCode)
      .slice(0, Math.max(0, rankLimit))
      .forEach((candidate, index) => {
        awards.push({ ...candidate, tierCode, rank: index + 1 });
      });
  }
  return { candidates, awards, warnings };
}
