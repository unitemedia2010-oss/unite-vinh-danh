import { assertEquals } from "jsr:@std/assert@1";
import { normalizeSheetTrigger, resolveImportStatus } from "./sync-policy.ts";

Deno.test("automated imports always remain review candidates", () => {
  assertEquals(resolveImportStatus(true, 0), "needs_review");
  assertEquals(resolveImportStatus(true, 3), "needs_review");
  assertEquals(resolveImportStatus(false, 0), "validated");
  assertEquals(resolveImportStatus(false, 1), "needs_review");
});

Deno.test("trigger metadata is allowlisted and bounded", () => {
  assertEquals(
    normalizeSheetTrigger({
      kind: "apps_script",
      eventId: "evt:abc-123",
      sourceFingerprint: "a".repeat(64),
      observedAt: "2026-07-28T08:30:00+07:00",
      stableForSeconds: 99999,
      secret: "must-not-be-copied",
    }, true),
    {
      kind: "apps_script",
      eventId: "evt:abc-123",
      sourceFingerprint: "a".repeat(64),
      observedAt: "2026-07-28T01:30:00.000Z",
      stableForSeconds: 3600,
    },
  );
});

Deno.test("untrusted scheduled metadata falls back to cron", () => {
  assertEquals(
    normalizeSheetTrigger({
      kind: "other",
      eventId: "contains spaces",
      sourceFingerprint: "short",
      observedAt: "invalid",
    }, true),
    { kind: "cron" },
  );
  assertEquals(normalizeSheetTrigger({ kind: "apps_script" }, false), {
    kind: "admin",
  });
});
