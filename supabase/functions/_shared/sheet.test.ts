import {
  extractPeriod,
  formatVnd,
  normalizeSheetRows,
  parseCsv,
  parseInteger,
  type SheetMapping,
} from "./sheet.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

Deno.test("formats revenue exactly as requested", () => {
  assertEquals(formatVnd(156000000), "156.000.000 VNĐ");
  assertEquals(parseInteger("156.000.000 VNĐ"), 156000000);
});

Deno.test("extracts Vietnamese month title", () => {
  assertEquals(extractPeriod("DOANH SỐ THEO KHU VỰC T7/2026"), "2026-07");
  assertEquals(extractPeriod("THÁNG 12/2026"), "2026-12");
  assertEquals(extractPeriod("DOANH SỐ ĐẾN 27/07/2026"), "2026-07");
});

Deno.test("metric header month overrides the daily observation month", () => {
  const mapping: SheetMapping = {
    id: "mapping-period",
    code: "DS_KV",
    entity_type: "branch_manager",
    sheet_name: "DS-KV",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      display_name: "QLCN",
      manager_metric: { prefix: "TỔNG GDTC+HC T" },
    },
    filter_config: {
      numericRankOnly: true,
      selectedRevenueField: "manager_metric",
      periodColumnField: "manager_metric",
      requiredUniqueColumns: ["manager_metric"],
    },
  };
  const result = normalizeSheetRows([
    ["DOANH SỐ THEO KHU VỰC ĐẾN 27/07/2026"],
    ["STT", "QLCN", "TỔNG GDTC+HC T8"],
    ["1", "Nguyễn An", "0"],
  ], mapping);

  assertEquals(result.periodId, "2026-08");
  assertEquals(result.blockingErrors, []);
});

Deno.test("explicit title period conflicting with metric header is blocking", () => {
  const mapping: SheetMapping = {
    id: "mapping-period-conflict",
    code: "DS_KV",
    entity_type: "branch_manager",
    sheet_name: "DS-KV",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      display_name: "QLCN",
      manager_metric: { prefix: "TỔNG GDTC+HC T" },
    },
    filter_config: {
      numericRankOnly: true,
      selectedRevenueField: "manager_metric",
      periodColumnField: "manager_metric",
      requiredUniqueColumns: ["manager_metric"],
    },
  };
  const result = normalizeSheetRows([
    ["DOANH SỐ T7/2026"],
    ["STT", "QLCN", "TỔNG GDTC+HC T8"],
    ["1", "Nguyễn An", "1"],
  ], mapping);

  assertEquals(result.periodId, "2026-07");
  assertEquals(result.blockingErrors.length, 1);
});

Deno.test("required revenue header must exist exactly once", () => {
  const mapping: SheetMapping = {
    id: "mapping-required",
    code: "DS_KV",
    entity_type: "branch_manager",
    sheet_name: "DS-KV",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      display_name: "QLCN",
      manager_metric: { prefix: "TỔNG GDTC+HC T" },
    },
    filter_config: {
      numericRankOnly: true,
      selectedRevenueField: "manager_metric",
      requiredUniqueColumns: ["manager_metric"],
    },
  };

  const missing = normalizeSheetRows([
    ["DOANH SỐ T8/2026"],
    ["STT", "QLCN", "TỔNG CỌC T8"],
    ["1", "Nguyễn An", "1"],
  ], mapping);
  assertEquals(missing.blockingErrors.length, 1);

  const duplicate = normalizeSheetRows([
    ["DOANH SỐ T8/2026"],
    ["STT", "QLCN", "TỔNG GDTC+HC T8", "TỔNG GDTC+HC T8 dự phòng"],
    ["1", "Nguyễn An", "1", "2"],
  ], mapping);
  assertEquals(duplicate.blockingErrors.length, 1);
  assertEquals(duplicate.rows[0].revenueVnd, null);
});

Deno.test("uses the accounting-approved fixed column when its header is mistyped", () => {
  const mapping: SheetMapping = {
    id: "mapping-fixed-column",
    code: "DS_KV",
    entity_type: "branch_manager",
    sheet_name: "DS-KV",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      branch_code: "KHU VỰC",
      display_name: "QLCN",
      entity_code: "MNV",
      manager_metric: { prefix: "TỔNG GDTC+HC T", columnIndex: 10 },
      source_board_code: "BẢNG ĐẤU",
    },
    filter_config: {
      numericRankOnly: true,
      selectedRevenueField: "manager_metric",
      periodColumnField: "manager_metric",
      requiredUniqueColumns: ["manager_metric", "source_board_code"],
    },
  };
  const result = normalizeSheetRows([
    ["DOANH SỐ THEO KHU VỰC ĐẾN 27/07/2026"],
    [
      "STT",
      "KHU VỰC",
      "QLCN",
      "MNV",
      "CẤP BẬC",
      "CỌC RVT8",
      "GDTC RVT8",
      "CỌC T8",
      "GDTC T8",
      "TỔNG CỌC T8",
      "TỔNG CỌC T8",
      "% TN QLCN",
      "BẢNG ĐẤU",
    ],
    ["1", "DOC1", "Nguyễn Thị Hà", "U177", "QLCN", "0", "0", "0", "0", "0", "4.570.000", "", "TƯỚNG QUÂN"],
  ], mapping);

  assertEquals(result.blockingErrors, []);
  assertEquals(result.periodId, "2026-08");
  assertEquals(result.rows[0].metrics.manager_metric, 4570000);
  assertEquals(result.rows[0].sourceBoardCode, "TƯỚNG QUÂN");
  assertEquals(result.warnings.length, 1);
});

Deno.test("fixed accounting column wins when a matching header exists elsewhere", () => {
  const mapping: SheetMapping = {
    id: "mapping-fixed-column-authoritative",
    code: "DS_KV",
    entity_type: "branch_manager",
    sheet_name: "DS-KV",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      branch_code: "KHU VỰC",
      display_name: "QLCN",
      entity_code: "MNV",
      manager_metric: { prefix: "TỔNG GDTC+HC T", columnIndex: 10 },
      source_board_code: "BẢNG ĐẤU",
    },
    filter_config: {
      numericRankOnly: true,
      selectedRevenueField: "manager_metric",
      periodColumnField: "manager_metric",
      requiredUniqueColumns: ["manager_metric", "source_board_code"],
    },
  };
  const result = normalizeSheetRows([
    ["DOANH SỐ THEO KHU VỰC ĐẾN 27/07/2026"],
    [
      "STT",
      "KHU VỰC",
      "QLCN",
      "MNV",
      "CẤP BẬC",
      "CỌC RVT8",
      "GDTC RVT8",
      "CỌC T8",
      "TỔNG GDTC+HC T8",
      "TỔNG CỌC T8",
      "TỔNG CỌC T8",
      "% TN QLCN",
      "BẢNG ĐẤU",
    ],
    ["1", "DOC1", "Nguyễn Thị Hà", "U177", "QLCN", "0", "0", "0", "999.000.000", "0", "4.570.000", "", "TƯỚNG QUÂN"],
  ], mapping);

  assertEquals(result.blockingErrors, []);
  assertEquals(result.periodId, "2026-08");
  assertEquals(result.rows[0].metrics.manager_metric, 4570000);
  assertEquals(result.warnings.length, 1);
});

Deno.test("parses CSV cells containing commas and line breaks", () => {
  assertEquals(parseCsv('STT,TÊN,GHI CHÚ\n1,"Nguyễn, An","Dòng 1\nDòng 2"\n'), [
    ["STT", "TÊN", "GHI CHÚ"],
    ["1", "Nguyễn, An", "Dòng 1\nDòng 2"],
  ]);
});

Deno.test("normalizes rows by header and marks an unselected revenue field", () => {
  const mapping: SheetMapping = {
    id: "mapping-1",
    code: "DS_KV",
    entity_type: "branch_manager",
    sheet_name: "DS-KV",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      branch_code: "KHU VỰC",
      display_name: "QLCN",
      entity_code: "MNV",
      total_deposit: { regex: "^TỔNG CỌC T[0-9]+$" },
      total_gdtc_hc: { regex: "^TỔNG GDTC\\+HC T[0-9]+$" },
    },
    filter_config: {
      numericRankOnly: true,
      skipBlankName: true,
      requiresRevenueSelection: true,
    },
  };
  const result = normalizeSheetRows([
    ["DOANH SỐ THEO KHU VỰC T7/2026"],
    ["STT", "KHU VỰC", "QLCN", "MNV", "TỔNG CỌC T7", "TỔNG GDTC+HC T7"],
    ["1", "TBT", "Nguyễn An", "U001", "156000000", "100000000"],
    ["TỔNG", "", "", "", "156000000", "100000000"],
  ], mapping);

  assertEquals(result.periodId, "2026-07");
  assertEquals(result.rows.length, 1);
  assertEquals(result.rows[0].displayRevenue, null);
  assertEquals(result.rows[0].metrics.total_deposit, 156000000);
  assertEquals(result.rows[0].validationStatus, "warning");
  assertEquals(result.rows[0].validationMessages, [
    "Chưa chọn cột doanh số xét vinh danh",
  ]);
});

Deno.test("handles Google Visualization collapsing the title and STT header", () => {
  const mapping: SheetMapping = {
    id: "mapping-2",
    code: "DS_KV",
    entity_type: "branch_manager",
    sheet_name: "DS-KV",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      branch_code: "KHU VỰC",
      display_name: "QLCN",
      entity_code: "MNV",
      total_deposit: { regex: "^TỔNG CỌC T[0-9]+$" },
    },
    filter_config: {
      numericRankOnly: true,
      skipBlankName: true,
      selectedRevenueField: "total_deposit",
    },
  };
  const result = normalizeSheetRows([
    [
      "",
      "DOANH SỐ THEO KHU VỰC T7/2026 STT",
      "KHU VỰC",
      "QLCN",
      "MNV",
      "TỔNG CỌC T7",
    ],
    ["", "1", "TBT", "Nguyễn An", "U001", "156.000.000"],
  ], mapping);

  assertEquals(result.title, "DOANH SỐ THEO KHU VỰC T7/2026");
  assertEquals(result.periodId, "2026-07");
  assertEquals(result.rows.length, 1);
  assertEquals(result.rows[0].sourceRowNumber, 3);
  assertEquals(result.rows[0].branchCode, "TBT");
  assertEquals(result.rows[0].displayRevenue, "156.000.000 VNĐ");
});
