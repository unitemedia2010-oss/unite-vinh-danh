import { assertEquals } from "jsr:@std/assert@1";
import {
  buildRankingColumnUpdates,
  type RankingColumnSelection,
} from "./ranking-columns.ts";
import { normalizeSheetRows, type SheetMapping } from "./sheet.ts";

function mappings(selection: RankingColumnSelection): {
  team: SheetMapping;
  manager: SheetMapping;
} {
  const updates = buildRankingColumnUpdates(selection);
  const teamRule = updates.find((item) => item.code === "DS_TEAM")!.rule;
  const managerRule = updates.find((item) => item.code === "DS_KV")!.rule;
  return {
    team: {
      id: "team",
      code: "DS_TEAM",
      entity_type: "team",
      sheet_name: "DS-TEAM",
      range_a1: "B1:S1000",
      title_row: 1,
      header_row: 2,
      data_start_row: 3,
      column_map: {
        source_rank: { exact: "STT", columnIndex: 0 },
        team_code: { exact: "TEAM", columnIndex: 1 },
        display_name: { exact: "LEADER", columnIndex: 2 },
        entity_code: { exact: "MNV", columnIndex: 3 },
        branch_code: { exact: "KHU VỰC", columnIndex: 5 },
        total_gdtc_hc_metric: {
          prefix: "TỔNG GDTC+HC T",
          columnIndex: 12,
        },
        best_team_metric: teamRule,
        source_board_code: { exact: "BẢNG ĐẤU", columnIndex: 17 },
      },
      filter_config: {
        selectedRevenueField: "best_team_metric",
        periodColumnField: "total_gdtc_hc_metric",
        requiredUniqueColumns: [
          "best_team_metric",
          "total_gdtc_hc_metric",
          "source_board_code",
        ],
      },
    },
    manager: {
      id: "manager",
      code: "DS_KV",
      entity_type: "branch_manager",
      sheet_name: "DS-KV",
      range_a1: "B1:N1000",
      title_row: 1,
      header_row: 2,
      data_start_row: 3,
      column_map: {
        source_rank: { exact: "STT", columnIndex: 0 },
        branch_code: { exact: "KHU VỰC", columnIndex: 1 },
        display_name: { exact: "QLCN", columnIndex: 2 },
        entity_code: { exact: "MNV", columnIndex: 3 },
        manager_metric: managerRule,
        source_board_code: { exact: "BẢNG ĐẤU", columnIndex: 12 },
      },
      filter_config: {
        selectedRevenueField: "manager_metric",
        periodColumnField: "manager_metric",
        requiredUniqueColumns: ["manager_metric", "source_board_code"],
      },
    },
  };
}

const teamMatrix = [
  ["DOANH SỐ THEO TEAM ĐẾN 29/07/2026"],
  [
    "STT",
    "TEAM",
    "LEADER",
    "MNV",
    "CẤP BẬC",
    "KHU VỰC",
    "CỤM",
    "CỌC RVT8",
    "GDTC RVT8",
    "CỌC T8",
    "GDTC T8",
    "TỔNG CỌC T8",
    "TỔNG GDTC+HC T8",
    "GDTC XÉT BEST TEAM",
    "GDTC TÍNH TN",
    "%TN LEADER",
    "",
    "BẢNG ĐẤU",
  ],
  [
    "1",
    "THAWK",
    "Dương Quý Cần",
    "U684",
    "Leader CT",
    "LTC",
    "TIÊN PHONG",
    "0",
    "0",
    "0",
    "0",
    "111.000.000",
    "222.000.000",
    "333.000.000",
    "",
    "",
    "",
    "SU TU",
  ],
];

const managerMatrix = [
  ["DOANH SỐ THEO KHU VỰC ĐẾN 29/07/2026"],
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
    "TỔNG GDTC+HC T8",
    "% TN QLCN",
    "BẢNG ĐẤU",
  ],
  [
    "1",
    "LTC",
    "Trần Thị Huế",
    "U261",
    "QLCN TV",
    "0",
    "0",
    "0",
    "0",
    "444.000.000",
    "555.000.000",
    "",
    "TUONG QUAN",
  ],
];

Deno.test("early-month M/K selection reads deposits and preserves Bảng Đấu", () => {
  const { team, manager } = mappings({ team: "M", manager: "K" });
  const teamResult = normalizeSheetRows(teamMatrix, team);
  const managerResult = normalizeSheetRows(managerMatrix, manager);

  assertEquals(teamResult.rows[0].metrics.best_team_metric, 111_000_000);
  assertEquals(teamResult.rows[0].revenueVnd, 111_000_000);
  assertEquals(teamResult.rows[0].sourceBoardCode, "SU TU");
  assertEquals(teamResult.periodId, "2026-08");

  assertEquals(managerResult.rows[0].metrics.manager_metric, 444_000_000);
  assertEquals(managerResult.rows[0].revenueVnd, 444_000_000);
  assertEquals(managerResult.rows[0].sourceBoardCode, "TUONG QUAN");
  assertEquals(managerResult.periodId, "2026-08");
});

Deno.test("closing O/L selection reads successful transactions", () => {
  const { team, manager } = mappings({ team: "O", manager: "L" });
  const teamResult = normalizeSheetRows(teamMatrix, team);
  const managerResult = normalizeSheetRows(managerMatrix, manager);

  assertEquals(teamResult.rows[0].metrics.best_team_metric, 333_000_000);
  assertEquals(teamResult.rows[0].revenueVnd, 333_000_000);
  assertEquals(managerResult.rows[0].metrics.manager_metric, 555_000_000);
  assertEquals(managerResult.rows[0].revenueVnd, 555_000_000);
});
