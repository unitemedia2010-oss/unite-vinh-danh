import { assertEquals } from "jsr:@std/assert@1";
import { resolveSheetPeriod } from "./sheet-period.ts";

Deno.test("uses the single metric-derived period", () => {
  assertEquals(resolveSheetPeriod(["2026-08", "2026-08"]), {
    ok: true,
    periodId: "2026-08",
  });
});

Deno.test("different metric months fail closed", () => {
  assertEquals(resolveSheetPeriod(["2026-08", "2026-07"]), {
    ok: false,
    error: "SOURCE_PERIOD_CONFLICT",
    periods: ["2026-07", "2026-08"],
  });
});

Deno.test("caller cannot relabel T8 data as another period", () => {
  assertEquals(resolveSheetPeriod(["2026-08"], "2026-07"), {
    ok: false,
    error: "REQUEST_PERIOD_MISMATCH",
    periods: ["2026-08"],
    requestedPeriodId: "2026-07",
  });
});

Deno.test("missing metric period fails closed", () => {
  assertEquals(resolveSheetPeriod([]), {
    ok: false,
    error: "PERIOD_NOT_FOUND",
    periods: [],
  });
});
