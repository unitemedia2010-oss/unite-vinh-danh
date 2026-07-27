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
  assertEquals(result.rows[0].validationMessages, ["Chưa chọn cột doanh số xét vinh danh"]);
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
    ["", "DOANH SỐ THEO KHU VỰC T7/2026 STT", "KHU VỰC", "QLCN", "MNV", "TỔNG CỌC T7"],
    ["", "1", "TBT", "Nguyễn An", "U001", "156.000.000"],
  ], mapping);

  assertEquals(result.title, "DOANH SỐ THEO KHU VỰC T7/2026");
  assertEquals(result.periodId, "2026-07");
  assertEquals(result.rows.length, 1);
  assertEquals(result.rows[0].sourceRowNumber, 3);
  assertEquals(result.rows[0].branchCode, "TBT");
  assertEquals(result.rows[0].displayRevenue, "156.000.000 VNĐ");
});
