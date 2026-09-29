import { normalizeSheetRows, type SheetMapping } from "./sheet.ts";

export const AUTO_DEPOSIT_VERSION = "total-deposit-header-v1";
export const AUTO_DEPOSIT_RANGE = "A1:AZ1000";
const depositRule = { normalizedRegex: "^TONG COC T\\s*(?:0?[1-9]|1[0-2])$" };

export const isAutomaticRanking = (mapping: SheetMapping) =>
  mapping.code === "DS_KV" || mapping.code === "DS_TEAM";

/** Runtime policy intentionally supersedes legacy SQL/manual position settings. */
export function automaticRankingMapping(mapping: SheetMapping): SheetMapping {
  if (!isAutomaticRanking(mapping)) return mapping;
  const team = mapping.code === "DS_TEAM";
  const metric = team ? "best_team_metric" : "manager_metric";
  return {
    ...mapping,
    range_a1: AUTO_DEPOSIT_RANGE,
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    stop_labels: ["TỔNG", "TỔNG CỘNG"],
    column_map: {
      source_rank: "STT",
      display_name: team ? "LEADER" : "QLCN",
      entity_code: "MNV",
      branch_code: "KHU VỰC",
      role_code: "CẤP BẬC",
      ...(team ? { team_code: "TEAM" } : {}),
      source_board_code: "BẢNG ĐẤU",
      [metric]: depositRule,
    },
    filter_config: {
      ...mapping.filter_config,
      selectedRevenueField: metric,
      periodColumnField: metric,
      requiredUniqueColumns: ["source_rank", "display_name", "entity_code", "branch_code",
        "role_code", "source_board_code", metric, ...(team ? ["team_code"] : [])],
      requiresRevenueSelection: false,
      numericRankOnly: true,
      strictNumericRank: true,
      physicalRowNumbers: true,
      skipLeadingTotal: true,
      stopTrailingAggregate: true,
      skipBlankName: false,
      rankingSourceMode: "deposit",
      rankingSourceColumn: null,
      rankingSourceLabel: null,
    },
  };
}

export function sheetColumnLetter(index: number): string {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + (value - 1) % 26) + result;
  }
  return result;
}

export function normalizeAutomaticRanking(matrix: string[][], mapping: SheetMapping, visualization = false) {
  const effective = automaticRankingMapping(mapping);
  if (visualization) effective.filter_config = { ...effective.filter_config, physicalRowNumbers: false };
  const normalized = normalizeSheetRows(matrix, effective);
  const metric = mapping.code === "DS_TEAM" ? "best_team_metric" : "manager_metric";
  const index = normalized.columnIndexes[metric] ?? -1;
  if (index < 0) {
    normalized.blockingErrors.push(`${mapping.sheet_name}: cần đúng một cột TỔNG CỌC T1…T12; không dùng CỌC Tn, CỌC RVTn hoặc GDTC thay thế.`);
  }
  if (!normalized.periodId) {
    normalized.blockingErrors.push(`${mapping.sheet_name}: không xác định được kỳ; tiêu đề cần có năm, ví dụ T9/2026.`);
  }
  // An invalid amount must not silently disappear from an automatic ranking.
  for (const row of normalized.blockingErrors.length ? [] : normalized.rows) {
    if (row.revenueVnd === null || row.validationMessages.includes("Dòng nguồn có lỗi công thức")) {
      normalized.blockingErrors.push(`${mapping.sheet_name}: dòng ${row.sourceRowNumber} thiếu số tổng cọc hợp lệ hoặc có lỗi công thức; giữ bản đang phát.`);
    }
  }
  const column = index >= 0 ? sheetColumnLetter(index) : "";
  const header = index >= 0 ? normalized.headers[index] : "";
  return {
    mapping: effective,
    normalized,
    rankingSource: {
      mode: "deposit" as const,
      detection: AUTO_DEPOSIT_VERSION,
      column,
      header,
      headerRow: visualization ? effective.header_row : normalized.headerRow,
      periodId: normalized.periodId,
      range: AUTO_DEPOSIT_RANGE,
      label: `${mapping.sheet_name}${column ? ` cột ${column}` : ""} · ${header || "TỔNG CỌC Tn (chưa xác định)"}`,
    },
  };
}
