import { normalizeSheetRows, type SheetMapping } from "./sheet.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

Deno.test("maps the appended Bảng Đấu column by prefix", () => {
  const mapping: SheetMapping = {
    id: "mapping-board",
    code: "DS_TEAM",
    entity_type: "team",
    sheet_name: "DS-TEAM",
    title_row: 1,
    header_row: 2,
    data_start_row: 3,
    column_map: {
      source_rank: "STT",
      team_code: "TEAM",
      entity_code: "MNV",
      source_board_code: { prefix: "BẢNG ĐẤU" },
    },
    filter_config: { numericRankOnly: true },
  };
  const result = normalizeSheetRows([
    ["DOANH SỐ THEO TEAM T7/2026"],
    ["STT", "TEAM", "MNV", "Bảng Đấu Leader"],
    ["1", "FUSION", "U382", "KỲ LÂN"],
  ], mapping);
  assertEquals(result.rows[0].sourceBoardCode, "KỲ LÂN");
});
