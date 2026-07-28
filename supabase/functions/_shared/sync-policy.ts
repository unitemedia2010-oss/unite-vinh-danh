export type SheetTriggerMetadata = {
  kind: "apps_script" | "cron" | "admin";
  eventId?: string;
  sourceFingerprint?: string;
  observedAt?: string;
  stableForSeconds?: number;
};

const shortToken = /^[A-Za-z0-9._:-]{1,160}$/;
const sha256Hex = /^[a-f0-9]{64}$/i;

function validIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

/**
 * Accept only bounded, non-sensitive trigger diagnostics. Arbitrary Apps Script
 * request data must never be copied into import metadata or audit logs.
 */
export function normalizeSheetTrigger(
  value: unknown,
  scheduled: boolean,
): SheetTriggerMetadata {
  if (!scheduled) return { kind: "admin" };
  const input = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const kind = input.kind === "apps_script" ? "apps_script" : "cron";
  const eventId =
    typeof input.eventId === "string" && shortToken.test(input.eventId)
      ? input.eventId
      : undefined;
  const sourceFingerprint = typeof input.sourceFingerprint === "string" &&
      sha256Hex.test(input.sourceFingerprint)
    ? input.sourceFingerprint.toLowerCase()
    : undefined;
  const observedAt = validIsoTimestamp(input.observedAt);
  const stableForSeconds = typeof input.stableForSeconds === "number" &&
      Number.isFinite(input.stableForSeconds)
    ? Math.max(0, Math.min(3600, Math.round(input.stableForSeconds)))
    : undefined;
  return {
    kind,
    ...(eventId ? { eventId } : {}),
    ...(sourceFingerprint ? { sourceFingerprint } : {}),
    ...(observedAt ? { observedAt } : {}),
    ...(stableForSeconds !== undefined ? { stableForSeconds } : {}),
  };
}

/** Automated imports are always review candidates, even when parsers emit no
 * warnings. Only a human-authenticated Admin import may auto-validate clean data.
 */
export function resolveImportStatus(
  scheduled: boolean,
  warningCount: number,
): "needs_review" | "validated" {
  return scheduled || warningCount > 0 ? "needs_review" : "validated";
}
