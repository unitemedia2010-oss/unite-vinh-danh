import {
  formatVnd,
  type NormalizedSheetRow,
  normalizeText,
  parseInteger,
} from "./sheet.ts";
import { normalizeBestTeamCode } from "./best-team.ts";
import { isQlcnBoardCode, normalizeManualBoardCode } from "./board-code.ts";

export const QLCN_DERIVATION_VERSION =
  "qlcn-ds-kv-row-total-gdtc-hc-manual-board-v6";

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
 * QLCN is sourced only from DS-KV. Every valid DS-KV region row is an
 * independent ranking entry:
 * - board membership: the row's operator-maintained Bảng Đấu value;
 * - ranking metric: the row's TỔNG GDTC+HC Tn value;
 * - the same MNV may therefore be honoured once for each managed region.
 *
 * There is intentionally no cross-row aggregation and no threshold fallback.
 * A bad row is excluded on its own; it never invalidates another valid row for
 * the same manager and never blocks the import after the source schema passed.
 */
export function deriveQlcnAwards(
  managerRows: NormalizedSheetRow[],
  rankLimit = 3,
): QlcnDerivation {
  const warnings: QlcnDerivation["warnings"] = [];
  const candidates: QlcnCandidate[] = [];

  for (const row of managerRows) {
    const messages = [...row.validationMessages];
    const region = normalizeBestTeamCode(row.branchCode);
    const displayName = row.displayName?.trim() ?? "";
    const employeeCode = cleanCode(row.entityCode);

    if (!region || !displayName) {
      const message =
        "Dòng DS-KV thiếu khu vực hoặc tên QLCN; chỉ dòng này bị loại khỏi bảng vinh danh.";
      messages.push(message);
      warnings.push({
        code: "MANAGER_MAPPING_INCOMPLETE",
        message,
        details: {
          sourceRow: row.sourceRowNumber,
          region,
          displayName: row.displayName,
        },
      });
    }
    if (!employeeCode) {
      const message =
        "QLCN thiếu MNV hợp lệ; chỉ dòng này bị loại để tránh nhận nhầm người.";
      messages.push(message);
      warnings.push({
        code: "MANAGER_CODE_MISSING",
        message,
        details: {
          sourceRow: row.sourceRowNumber,
          region,
          displayName: row.displayName,
        },
      });
    }

    const metric = parseInteger(row.metrics.manager_metric);
    if (metric === null || metric <= 0) {
      const message =
        "QLCN thiếu TỔNG GDTC+HC Tn hợp lệ; chỉ dòng này bị loại khỏi bảng vinh danh.";
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
        "QLCN chưa có Bảng Đấu; không tự suy luận bảng từ doanh số và chỉ loại dòng này.";
      messages.push(message);
      warnings.push({
        code: "QLCN_BOARD_MISSING",
        message,
        details: { sourceRow: row.sourceRowNumber, employeeCode, region },
      });
    } else if (!manualBoard) {
      const message =
        `Bảng Đấu QLCN không hợp lệ: ${rawBoard}; chỉ dòng này bị loại.`;
      messages.push(message);
      warnings.push({
        code: "QLCN_BOARD_INVALID",
        message,
        details: {
          sourceRow: row.sourceRowNumber,
          employeeCode,
          region,
          value: rawBoard,
        },
      });
    }

    // Keep an audit candidate even when the row is invalid. Placeholder values
    // are row-scoped and cannot collide with a valid manager in award_results.
    const safeRegion = region ?? `ROW${row.sourceRowNumber}`;
    const safeEmployeeCode = employeeCode ??
      `INVALID_ROW_${row.sourceRowNumber}`;
    const revenueVnd = metric !== null && metric > 0 ? metric : 0;
    const validationMessages = [...new Set(messages)];
    const eligible = Boolean(
      region && displayName && employeeCode && manualBoard &&
        validationMessages.length === 0,
    );

    candidates.push({
      managerKey: `row:${row.sourceRowKey}`,
      entityCode: safeEmployeeCode,
      displayName: displayName || `Dòng ${row.sourceRowNumber}`,
      roleCode: row.roleCode,
      regionCodes: [safeRegion],
      branchBreakdown: { [safeRegion]: revenueVnd },
      revenueVnd,
      displayRevenue: formatVnd(revenueVnd) ?? "0 VNĐ",
      tierCode: manualBoard,
      boardSource: manualBoard ? "manual" : "none",
      eligible,
      needsReview: !eligible,
      validationMessages,
      managerSourceRowKeys: [row.sourceRowKey],
      teamSourceRowKeys: [],
      sourceRowKeys: [row.sourceRowKey],
    });
  }

  candidates.sort((left, right) =>
    right.revenueVnd - left.revenueVnd ||
    left.entityCode.localeCompare(right.entityCode, "en") ||
    normalizeText(left.regionCodes[0]).localeCompare(
      normalizeText(right.regionCodes[0]),
      "en",
    ) ||
    left.managerSourceRowKeys[0].localeCompare(
      right.managerSourceRowKeys[0],
      "en",
    )
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
