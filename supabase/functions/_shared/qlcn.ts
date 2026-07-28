import {
  formatVnd,
  type NormalizedSheetRow,
  normalizeText,
  parseInteger,
} from "./sheet.ts";
import { normalizeBestTeamCode } from "./best-team.ts";
import { isQlcnBoardCode, normalizeManualBoardCode } from "./board-code.ts";

export const QLCN_DERIVATION_VERSION =
  "qlcn-ds-kv-total-gdtc-hc-manual-board-v5";

export type QlcnTierCode =
  | "QLCN_THU_LINH"
  | "QLCN_DAI_TUONG"
  | "QLCN_THONG_SOAI";

export type QlcnCandidate = {
  managerKey: string;
  entityCode: string;
  displayName: string;
  roleCode: string | null;
  regionCodes: string[];
  branchBreakdown: Record<string, number>;
  revenueVnd: number;
  displayRevenue: string;
  tierCode: QlcnTierCode | null;
  boardSource: "manual" | "none";
  eligible: boolean;
  needsReview: boolean;
  validationMessages: string[];
  managerSourceRowKeys: string[];
  teamSourceRowKeys: string[];
  sourceRowKeys: string[];
};

export type QlcnAward = QlcnCandidate & {
  tierCode: QlcnTierCode;
  rank: number;
};

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

/**
 * QLCN is sourced only from DS-KV:
 * - board membership: the operator-maintained Bảng Đấu column;
 * - ranking metric: TỔNG GDTC+HC Tn;
 * - duplicate MNV across different regions is summed exactly once per region.
 *
 * There is intentionally no threshold fallback. A missing/invalid/conflicting
 * board or metric excludes the person until accounting fixes the Sheet.
 */
export function deriveQlcnAwards(
  managerRows: NormalizedSheetRow[],
  rankLimit = 3,
): QlcnDerivation {
  const warnings: QlcnDerivation["warnings"] = [];
  type MutableManager = {
    managerKey: string;
    entityCode: string;
    displayName: string;
    roleCode: string | null;
    regionCodes: Set<string>;
    branchBreakdown: Record<string, number>;
    manualBoards: Set<QlcnTierCode>;
    eligible: boolean;
    needsReview: boolean;
    validationMessages: string[];
    managerSourceRowKeys: string[];
  };
  const managers = new Map<string, MutableManager>();

  for (const row of managerRows) {
    const region = normalizeBestTeamCode(row.branchCode);
    if (!region || !row.displayName) {
      warnings.push({
        code: "MANAGER_MAPPING_INCOMPLETE",
        message:
          "Dòng DS-KV thiếu khu vực hoặc tên QLCN nên không thể vinh danh.",
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

    const messages = [...row.validationMessages];
    const metric = parseInteger(row.metrics.manager_metric);
    if (metric === null || metric < 0) {
      const message =
        "QLCN thiếu TỔNG GDTC+HC Tn hợp lệ; dòng bị loại khỏi bảng vinh danh.";
      messages.push(message);
      warnings.push({
        code: "QLCN_METRIC_INVALID",
        message,
        details: {
          sourceRow: row.sourceRowNumber,
          employeeCode,
          value: row.metrics.manager_metric,
        },
      });
    }

    const rawBoard = row.sourceBoardCode?.trim() ?? "";
    const normalizedBoard = normalizeManualBoardCode(rawBoard);
    const manualBoard = normalizedBoard && isQlcnBoardCode(normalizedBoard)
      ? normalizedBoard
      : null;
    if (!rawBoard) {
      const message =
        "QLCN chưa có Bảng Đấu; không tự suy luận bảng từ doanh số.";
      messages.push(message);
      warnings.push({
        code: "QLCN_BOARD_MISSING",
        message,
        details: { sourceRow: row.sourceRowNumber, employeeCode },
      });
    } else if (!manualBoard) {
      const message = `Bảng Đấu QLCN không hợp lệ: ${rawBoard}.`;
      messages.push(message);
      warnings.push({
        code: "QLCN_BOARD_INVALID",
        message,
        details: {
          sourceRow: row.sourceRowNumber,
          employeeCode,
          value: rawBoard,
        },
      });
    }

    const key = `employee:${employeeCode}`;
    const existing = managers.get(key);
    if (!existing) {
      managers.set(key, {
        managerKey: key,
        entityCode: employeeCode,
        displayName: row.displayName,
        roleCode: row.roleCode,
        regionCodes: new Set([region]),
        branchBreakdown: {
          [region]: metric !== null && metric >= 0 ? metric : 0,
        },
        manualBoards: new Set(manualBoard ? [manualBoard] : []),
        eligible: messages.length === 0 && Boolean(manualBoard),
        needsReview: messages.length > 0 || !manualBoard,
        validationMessages: messages,
        managerSourceRowKeys: [row.sourceRowKey],
      });
      continue;
    }

    if (
      normalizeText(existing.displayName) !== normalizeText(row.displayName)
    ) {
      const message = "Cùng MNV QLCN nhưng họ tên không đồng nhất.";
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(message);
      warnings.push({
        code: "QLCN_NAME_CONFLICT",
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
      const message = "Cùng MNV QLCN nhưng cấp bậc không đồng nhất.";
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(message);
      warnings.push({
        code: "QLCN_ROLE_CONFLICT",
        message,
        details: { employeeCode, sourceRow: row.sourceRowNumber },
      });
    }
    if (existing.regionCodes.has(region)) {
      const message =
        `MNV ${employeeCode} bị lặp khu vực ${region}; không cộng trùng doanh số.`;
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(message);
      warnings.push({
        code: "QLCN_REGION_DUPLICATE",
        message,
        details: { employeeCode, region, sourceRow: row.sourceRowNumber },
      });
    } else {
      existing.regionCodes.add(region);
      existing.branchBreakdown[region] = metric !== null && metric >= 0
        ? metric
        : 0;
    }
    if (manualBoard) existing.manualBoards.add(manualBoard);
    existing.managerSourceRowKeys.push(row.sourceRowKey);
    if (messages.length) {
      existing.eligible = false;
      existing.needsReview = true;
      existing.validationMessages.push(...messages);
    }
  }

  const candidates = [...managers.values()].map<QlcnCandidate>((manager) => {
    const revenueVnd = Object.values(manager.branchBreakdown).reduce(
      (sum, value) => sum + value,
      0,
    );
    let tierCode: QlcnTierCode | null = null;
    let boardSource: QlcnCandidate["boardSource"] = "none";
    if (manager.manualBoards.size === 1) {
      tierCode = [...manager.manualBoards][0];
      boardSource = "manual";
    } else if (manager.manualBoards.size > 1) {
      const values = [...manager.manualBoards].sort();
      const message = `MNV ${manager.entityCode} có Bảng Đấu QLCN mâu thuẫn (${
        values.join(", ")
      }); đã loại khỏi kết quả.`;
      manager.eligible = false;
      manager.needsReview = true;
      manager.validationMessages.push(message);
      warnings.push({
        code: "QLCN_BOARD_CONFLICT",
        message,
        details: { employeeCode: manager.entityCode, values },
      });
    }
    if (!tierCode) manager.eligible = false;
    return {
      managerKey: manager.managerKey,
      entityCode: manager.entityCode,
      displayName: manager.displayName,
      roleCode: manager.roleCode,
      regionCodes: [...manager.regionCodes].sort(),
      branchBreakdown: manager.branchBreakdown,
      revenueVnd,
      displayRevenue: formatVnd(revenueVnd) ?? "0 VNĐ",
      tierCode,
      boardSource,
      eligible: manager.eligible,
      needsReview: manager.needsReview,
      validationMessages: [...new Set(manager.validationMessages)],
      managerSourceRowKeys: [...new Set(manager.managerSourceRowKeys)],
      teamSourceRowKeys: [],
      sourceRowKeys: [...new Set(manager.managerSourceRowKeys)],
    };
  }).sort((left, right) =>
    right.revenueVnd - left.revenueVnd ||
    left.entityCode.localeCompare(right.entityCode, "en") ||
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
      .filter((candidate): candidate is QlcnCandidate & {
        tierCode: QlcnTierCode;
      } => candidate.eligible && candidate.tierCode === tierCode)
      .slice(0, Math.max(0, rankLimit))
      .forEach((candidate, index) =>
        awards.push({ ...candidate, tierCode, rank: index + 1 })
      );
  }

  return { candidates, awards, warnings };
}
