import {
  isLeaderBoardCode,
  normalizeManualBoardCode,
} from "./board-code.ts";
import {
  formatVnd,
  type NormalizedSheetRow,
  normalizeText,
  parseInteger,
} from "./sheet.ts";

export const LEADER_DERIVATION_VERSION = "leader-manual-board-by-employee-v1";

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
  boardSource: "manual" | "derived" | "none";
  needsReview: boolean;
  validationMessages: string[];
  sourceRowKeys: string[];
  metricSources: Record<string, "leader_metric_candidate" | "best_team_metric">;
};

export type LeaderAward = LeaderCandidate & { tierCode: LeaderTierCode; rank: number };

export type LeaderDerivation = {
  candidates: LeaderCandidate[];
  awards: LeaderAward[];
  warnings: LeaderWarning[];
};

function cleanCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return code && /^[A-Z0-9_-]+$/.test(code) ? code : null;
}

function tierFor(value: number): LeaderTierCode | null {
  if (value >= 200_000_000) return "LEADER_KY_LAN";
  if (value >= 100_000_000) return "LEADER_PHUONG_HOANG";
  if (value >= 50_000_000) return "LEADER_SU_TU";
  return null;
}

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
    needsReview: boolean;
    validationMessages: string[];
    sourceRowKeys: string[];
    metricSources: Record<string, "leader_metric_candidate" | "best_team_metric">;
  };
  const leaders = new Map<string, MutableLeader>();

  for (const row of rows) {
    const employeeCode = cleanCode(row.entityCode);
    if (!employeeCode || !row.displayName) {
      warnings.push({
        code: "LEADER_IDENTITY_MISSING",
        message: "Dòng Leader thiếu MNV hoặc họ tên nên chưa thể gộp vinh danh.",
        details: { sourceRow: row.sourceRowNumber, employeeCode, displayName: row.displayName },
      });
      continue;
    }
    const rawBoard = row.sourceBoardCode?.trim() ?? "";
    const normalizedBoard = normalizeManualBoardCode(rawBoard);
    const manualBoard = normalizedBoard && isLeaderBoardCode(normalizedBoard)
      ? normalizedBoard
      : null;
    const messages = [...row.validationMessages];
    if (rawBoard && !manualBoard) {
      const message = `Bảng Đấu Leader không hợp lệ: ${rawBoard}.`;
      messages.push(message);
      warnings.push({
        code: "LEADER_BOARD_INVALID",
        message,
        details: { sourceRow: row.sourceRowNumber, employeeCode, value: rawBoard },
      });
    }

    const preferredRevenue = parseInteger(row.metrics.leader_metric_candidate);
    const fallbackRevenue = parseInteger(row.metrics.best_team_metric);
    const metricSource = preferredRevenue !== null
      ? "leader_metric_candidate" as const
      : "best_team_metric" as const;
    const revenue = preferredRevenue ?? fallbackRevenue;
    if (preferredRevenue === null && fallbackRevenue !== null) {
      const message = "Thiếu GDTC TÍNH TN; đã dùng GDTC XÉT BEST TEAM cho Leader.";
      messages.push(message);
      warnings.push({
        code: "LEADER_METRIC_FALLBACK",
        message,
        details: { sourceRow: row.sourceRowNumber, employeeCode, revenueVnd: fallbackRevenue },
      });
    }
    if (revenue === null || revenue < 0) {
      const message = "Leader thiếu doanh số hợp lệ nên dòng chưa được cộng.";
      messages.push(message);
      warnings.push({
        code: "LEADER_METRIC_INVALID",
        message,
        details: { sourceRow: row.sourceRowNumber, employeeCode, revenueVnd: revenue },
      });
    }

    const existing = leaders.get(employeeCode);
    if (existing) {
      if (normalizeText(existing.displayName) !== normalizeText(row.displayName)) {
        existing.needsReview = true;
        existing.validationMessages.push("Cùng MNV Leader nhưng họ tên không đồng nhất.");
      }
      if (row.branchCode) existing.branchCodes.add(row.branchCode.trim().toUpperCase());
      if (row.teamCode) existing.teamCodes.add(row.teamCode.trim());
      if (manualBoard) existing.manualBoards.add(manualBoard);
      if (revenue !== null && revenue >= 0) existing.revenueVnd += revenue;
      existing.needsReview ||= messages.length > 0;
      existing.validationMessages.push(...messages);
      existing.sourceRowKeys.push(row.sourceRowKey);
      existing.metricSources[row.sourceRowKey] = metricSource;
    } else {
      leaders.set(employeeCode, {
        employeeCode,
        displayName: row.displayName,
        roleCode: row.roleCode,
        branchCodes: new Set(row.branchCode ? [row.branchCode.trim().toUpperCase()] : []),
        teamCodes: new Set(row.teamCode ? [row.teamCode.trim()] : []),
        revenueVnd: revenue !== null && revenue >= 0 ? revenue : 0,
        manualBoards: new Set(manualBoard ? [manualBoard] : []),
        needsReview: messages.length > 0,
        validationMessages: messages,
        sourceRowKeys: [row.sourceRowKey],
        metricSources: { [row.sourceRowKey]: metricSource },
      });
    }
  }

  const candidates = [...leaders.values()].map<LeaderCandidate>((leader) => {
    const derivedTier = tierFor(leader.revenueVnd);
    let tierCode = derivedTier;
    let boardSource: LeaderCandidate["boardSource"] = derivedTier ? "derived" : "none";
    if (leader.manualBoards.size === 1) {
      tierCode = [...leader.manualBoards][0];
      boardSource = "manual";
    } else if (leader.manualBoards.size > 1) {
      const values = [...leader.manualBoards].sort();
      const message = `MNV ${leader.employeeCode} có Bảng Đấu Leader mâu thuẫn (${values.join(", ")}); đã dùng ngưỡng doanh số.`;
      leader.needsReview = true;
      leader.validationMessages.push(message);
      warnings.push({
        code: "LEADER_BOARD_CONFLICT",
        message,
        details: { employeeCode: leader.employeeCode, values, fallbackTier: derivedTier },
      });
    }
    return {
      employeeCode: leader.employeeCode,
      displayName: leader.displayName,
      roleCode: leader.roleCode,
      branchCodes: [...leader.branchCodes].sort(),
      teamCodes: [...leader.teamCodes].sort((a, b) => a.localeCompare(b, "vi")),
      revenueVnd: leader.revenueVnd,
      displayRevenue: formatVnd(leader.revenueVnd) ?? "0 VNĐ",
      tierCode,
      boardSource,
      needsReview: leader.needsReview,
      validationMessages: [...new Set(leader.validationMessages)],
      sourceRowKeys: [...new Set(leader.sourceRowKeys)],
      metricSources: leader.metricSources,
    };
  }).sort((left, right) =>
    right.revenueVnd - left.revenueVnd ||
    left.employeeCode.localeCompare(right.employeeCode, "en")
  );

  const awards: LeaderAward[] = [];
  for (const tierCode of ["LEADER_KY_LAN", "LEADER_PHUONG_HOANG", "LEADER_SU_TU"] as LeaderTierCode[]) {
    candidates.filter((candidate): candidate is LeaderCandidate & { tierCode: LeaderTierCode } =>
      candidate.tierCode === tierCode
    ).slice(0, Math.max(0, rankLimit)).forEach((candidate, index) => {
      awards.push({ ...candidate, tierCode, rank: index + 1 });
    });
  }
  return { candidates, awards, warnings };
}
