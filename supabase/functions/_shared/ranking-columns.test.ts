import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildRankingColumnUpdates,
  parseRankingColumnSelection,
  rankingSelectionMode,
} from "./ranking-columns.ts";

Deno.test("accepts only the four accounting-approved ranking column pairs", () => {
  assertEquals(
    parseRankingColumnSelection({ team: "M", manager: "K" }),
    { team: "M", manager: "K" },
  );
  assertEquals(
    parseRankingColumnSelection({ team: "O", manager: "L" }),
    { team: "O", manager: "L" },
  );
  assertThrows(
    () => parseRankingColumnSelection({ team: "N", manager: "L" }),
    Error,
    "RANKING_COLUMNS_INVALID",
  );
});

Deno.test("maps absolute Sheet columns to zero-based positions inside B ranges", () => {
  const deposit = buildRankingColumnUpdates({ team: "M", manager: "K" });
  assertEquals(deposit[0].columnIndex, 11);
  assertEquals(deposit[0].rule, {
    prefix: "TỔNG CỌC T",
    columnIndex: 11,
  });
  assertEquals(deposit[1].columnIndex, 9);

  const gdtc = buildRankingColumnUpdates({ team: "O", manager: "L" });
  assertEquals(gdtc[0].columnIndex, 13);
  assertEquals(gdtc[0].rule, {
    exact: "GDTC XÉT BEST TEAM",
    columnIndex: 13,
  });
  assertEquals(gdtc[1].columnIndex, 10);
});

Deno.test("detects matching presets and intentionally mixed selections", () => {
  assertEquals(rankingSelectionMode({ team: "M", manager: "K" }), "deposit");
  assertEquals(rankingSelectionMode({ team: "O", manager: "L" }), "gdtc");
  assertEquals(rankingSelectionMode({ team: "M", manager: "L" }), "mixed");
  assertEquals(rankingSelectionMode({ team: "O", manager: "K" }), "mixed");
});
