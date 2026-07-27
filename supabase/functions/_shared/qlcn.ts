import { formatVnd, type NormalizedSheetRow, normalizeText } from "./sheet.ts";
import {
  type BestTeamDerivation,
  deriveBestTeamContributions,
  normalizeBestTeamCode,
} from "./best-team.ts";
import {
  isQlcnBoardCode,
  normalizeManualBoardCode,
} from "./board-code.ts";

export const QLCN_DERIVATION_VERSION = "qlcn-best-team-manual-board-v4";

export type QlcnTierCode =
  | "QLCN_THU_LINH"
  | "QLCN_DAI_TUONG"
  | "QLCN_THONG_SOAI";

export type QlcnCandidate = {
  managerKey: string;
  entityCode: string | null;
  displayName: string;
  roleCode: string | null;
  regionCodes: string[];
  branchBreakdown: Record<string, number>;
  revenueVnd: number;
  displayRevenue: string;
  tierCode: QlcnTierCode;
  boardSource: "manual" | "derived";
  eligible: boolean;
  needsReview: boolean;
  validationMessages: string[];
  managerSourceRowKeys: string[];
  teamSourceRowKeys: string[];
  sourceRowKeys: string[];
};

export type QlcnAward = QlcnCandidate & { rank: number };

export type QlcnDerivation = {
  candidates: QlcnCandidate[];
  awards: QlcnAward[];
  warnings: Array<
    { code: string; message: string; details?: Record<string, unknown> }
  >;
};

function cleanCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  if (!code || !/^[A-Z0-9_-]+$/.test(code)) return null;
  return code;
}

function tierFor(value: number): QlcnTierCode {
  if (value >= 500_000_000) return "QLCN_THONG_SOAI";
  if (value >= 300_000_000) return "QLCN_DAI_TUONG";
  return "QLCN_THU_LINH";
}

export function deriveQlcnAwards(
  managerRows: NormalizedSheetRow[],
  teamRows: NormalizedSheetRow[],
  rankLimit = 3,
): QlcnDerivation {
  const bestTeam = deriveBestTeamContributions(teamRows);
  const result = deriveQlcnAwardsFromContributions(
    managerRows,
    bestTeam,
    rankLimit,
  );
  return { ...result, warnings: [...bestTeam.warnings, ...result.warnings] };
}

export function deriveQlcnAwardsFromContributions(
  managerRows: NormalizedSheetRow[],
  bestTeam: BestTeamDerivation,
  rankLimit = 3,
): QlcnDerivation {
  const warnings: QlcnDerivation["warnings"] = [];
  const branchTotals = new Map<
    string,
    { revenue: number; teamSourceRowKeys: string[] }
  >();
  for (const contribution of bestTeam.contributions) {
    const branch = branchTotals.get(contribution.regionCode) ??
      { revenue: 0, teamSourceRowKeys: [] };
    branch.revenue += contribution.revenueVnd;
    branch.teamSourceRowKeys.push(contribution.sourceRowKey);
    branchTotals.set(contribution.regionCode, branch);
  }

  type MutableManager =
    & Omit<
      QlcnCandidate,
      "revenueVnd" | "displayRevenue" | "tierCode" | "boardSource" |
        "regionCodes"
    >
    & {
      regionCodes: Set<string>;
      manualBoards: Set<QlcnTierCode>;
    };
  const managers = new Map<string, MutableManager>();
  const regionOwners = new Map<string, Set<string>>();

  for (const row of managerRows) {
    const region = normalizeBestTeamCode(row.branchCode);
    if (!region || !row.displayName) {
      warnings.push({
        code: "MANAGER_MAPPING_INCOMPLETE",
        message:
          "Dòng DS-KV thiếu khu vực hoặc tên QLCN nên không thể tạo ánh xạ.",
        details: {
          sourceRow: row.sourceRowNumber,
          region,
          displayName: row.displayName,
        },
      });
      continue;
    }
    const employeeCode = cleanCode(row.entityCode);
    if (!employeeCode) {
      warnings.push({
        code: "MANAGER_CODE_MISSING",
        message: "QLCN thiếu MNV; không gộp theo tên để tránh nhận nhầm người.",
        details: {
          sourceRow: row.sourceRowNumber,
          region,
          displayName: row.displayName,
        },
      });
      continue;
    }
    const normalizedName = normalizeText(row.displayName);
    const key = `employee:${employeeCode}`;
    const existing = managers.get(key);
    const messages = [...row.validationMessages];
    const rawBoard = row.sourceBoardCode?.trim() ?? "";
    const normalizedBoard = normalizeManualBoardCode(rawBoard);
    const manualBoard = normalizedBoard && isQlcnBoardCode(normalizedBoard)
      ? normalizedBoard
      : null;
    const invalidBoardMessage = rawBoard && !manualBoard
      ? `Bảng Đấu QLCN không hợp lệ: ${rawBoard}.`
      : null;
    if (invalidBoardMessage) {
      warnings.push({
        code: "QLCN_BOARD_INVALID",
        message: invalidBoardMessage,
        details: { sourceRow: row.sourceRowNumber, employeeCode, value: rawBoard },
      });
    }

    if (existing) {
      if (normalizeText(existing.displayName) !== normalizedName) {
        existing.eligible = false;
        existing.needsReview = true;
        existing.validationMessages.push(
          "Cùng mã QLCN nhưng họ tên không đồng nhất giữa các khu vực.",
        );
      }
      if (
        existing.roleCode && row.roleCode &&
        normalizeText(existing.roleCode) !== normalizeText(row.roleCode)
      ) {
        existing.eligible = false;
        existing.needsReview = true;
        existing.validationMessages.push(
          "Cùng mã QLCN nhưng cấp bậc không đồng nhất giữa các khu vực.",
        );
      }
      existing.regionCodes.add(region);
      if (manualBoard) existing.manualBoards.add(manualBoard);
      existing.managerSourceRowKeys.push(row.sourceRowKey);
      existing.sourceRowKeys.push(row.sourceRowKey);
      existing.validationMessages.push(...messages);
      if (messages.length) {
        existing.eligible = false;
        existing.needsReview = true;
      }
      if (invalidBoardMessage) {
        existing.needsReview = true;
        existing.validationMessages.push(invalidBoardMessage);
      }
    } else {
      managers.set(key, {
        managerKey: key,
        entityCode: employeeCode,
        displayName: row.displayName,
        roleCode: row.roleCode,
        regionCodes: new Set([region]),
        manualBoards: new Set(manualBoard ? [manualBoard] : []),
        branchBreakdown: {},
        eligible: messages.length === 0,
        needsReview: messages.length > 0 || Boolean(invalidBoardMessage),
        validationMessages: invalidBoardMessage
          ? [...messages, invalidBoardMessage]
          : messages,
        managerSourceRowKeys: [row.sourceRowKey],
        teamSourceRowKeys: [],
        sourceRowKeys: [row.sourceRowKey],
      });
    }
    const owners = regionOwners.get(region) ?? new Set<string>();
    owners.add(key);
    regionOwners.set(region, owners);
  }

  for (const [region, branch] of branchTotals.entries()) {
    const owners = regionOwners.get(region);
    if (!owners?.size) {
      warnings.push({
        code: "REGION_MANAGER_NOT_FOUND",
        message: "Khu vực có Best Team nhưng chưa tìm thấy QLCN trong DS-KV.",
        details: {
          region,
          revenueVnd: branch.revenue,
          teamSourceRowKeys: branch.teamSourceRowKeys,
        },
      });
      continue;
    }
    if (owners.size > 1) {
      warnings.push({
        code: "REGION_MANAGER_AMBIGUOUS",
        message:
          "Một khu vực đang ánh xạ tới nhiều QLCN; doanh số chưa được cộng để tránh trùng.",
        details: {
          region,
          managerKeys: [...owners],
          revenueVnd: branch.revenue,
        },
      });
      for (const key of owners) {
        const manager = managers.get(key);
        if (!manager) continue;
        manager.eligible = false;
        manager.needsReview = true;
        manager.validationMessages.push(
          `Khu vực ${region} đang có nhiều QLCN.`,
        );
      }
      continue;
    }
    const manager = managers.get([...owners][0]);
    if (!manager) continue;
    manager.branchBreakdown[region] = branch.revenue;
    manager.teamSourceRowKeys.push(...branch.teamSourceRowKeys);
    manager.sourceRowKeys.push(...branch.teamSourceRowKeys);
  }

  for (const [region, owners] of regionOwners.entries()) {
    if (branchTotals.has(region)) continue;
    for (const key of owners) {
      const manager = managers.get(key);
      if (!manager) continue;
      manager.branchBreakdown[region] = 0;
      manager.eligible = false;
      manager.validationMessages.push(
        `Khu vực ${region} chưa có GDTC XÉT BEST TEAM.`,
      );
      manager.needsReview = true;
    }
  }

  const candidates = [...managers.values()].map<QlcnCandidate>((manager) => {
    const revenueVnd = Object.values(manager.branchBreakdown).reduce(
      (sum, value) => sum + value,
      0,
    );
    const derivedTier = tierFor(revenueVnd);
    let tierCode = derivedTier;
    let boardSource: QlcnCandidate["boardSource"] = "derived";
    if (manager.manualBoards.size === 1) {
      tierCode = [...manager.manualBoards][0];
      boardSource = "manual";
    } else if (manager.manualBoards.size > 1) {
      const values = [...manager.manualBoards].sort();
      const message = `MNV ${manager.entityCode} có Bảng Đấu QLCN mâu thuẫn (${values.join(", ")}); đã dùng ngưỡng doanh số.`;
      manager.needsReview = true;
      manager.validationMessages.push(message);
      warnings.push({
        code: "QLCN_BOARD_CONFLICT",
        message,
        details: { employeeCode: manager.entityCode, values, fallbackTier: derivedTier },
      });
    }
    const { manualBoards: _manualBoards, ...candidateBase } = manager;
    return {
      ...candidateBase,
      regionCodes: [...manager.regionCodes].sort(),
      revenueVnd,
      displayRevenue: formatVnd(revenueVnd) ?? "0 VNĐ",
      tierCode,
      boardSource,
      managerSourceRowKeys: [...new Set(manager.managerSourceRowKeys)],
      teamSourceRowKeys: [...new Set(manager.teamSourceRowKeys)],
      sourceRowKeys: [...new Set(manager.sourceRowKeys)],
      validationMessages: [...new Set(manager.validationMessages)],
    };
  }).sort((left, right) =>
    right.revenueVnd - left.revenueVnd ||
    (left.entityCode ?? "").localeCompare(right.entityCode ?? "", "en") ||
    left.displayName.localeCompare(right.displayName, "vi")
  );

  const awards: QlcnAward[] = [];
  for (
    const tierCode of [
      "QLCN_THONG_SOAI",
      "QLCN_DAI_TUONG",
      "QLCN_THU_LINH",
    ] as QlcnTierCode[]
  ) {
    candidates
      .filter((candidate) =>
        candidate.tierCode === tierCode && candidate.eligible
      )
      .slice(0, Math.max(0, rankLimit))
      .forEach((candidate, index) =>
        awards.push({ ...candidate, rank: index + 1 })
      );
  }

  return { candidates, awards, warnings };
}
