const blockedExactKeys = new Set([
  "bucket",
  "rawdata",
  "rawsnapshot",
  "sourcerowkey",
  "sourcerowkeys",
  "managersourcerowkeys",
  "teamsourcerowkeys",
  "validationmessages",
  "employeeid",
  "employeecode",
  "entitycode",
  "visibilityhidden",
  "visibilityoriginalenabled",
  "visibilityrevision",
  "apikey",
  "authorization",
  "credential",
  "credentials",
  "password",
  "session",
]);

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Release rows keep hidden recognition items as an internal presentation
 * template so a later release can restore the same design. Delivery removes
 * those items completely, which also protects older Android TV builds that do
 * not understand the visibility marker. */
export function omitHiddenRecognitionItems(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const manifest = value as Record<string, unknown>;
  const playlistKey = Array.isArray(manifest.playlist)
    ? "playlist"
    : Array.isArray(manifest.items)
    ? "items"
    : null;
  if (!playlistKey) return value;
  const playlist = manifest[playlistKey] as unknown[];
  return {
    ...manifest,
    [playlistKey]: playlist.filter((item) =>
      !item || typeof item !== "object" || Array.isArray(item) ||
      (item as Record<string, unknown>).visibility_hidden !== true
    ),
  };
}

function isInternalKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return blockedExactKeys.has(normalized) ||
    normalized.endsWith("path") ||
    normalized.endsWith("token") ||
    normalized.includes("secret");
}

/** Remove Storage paths and import diagnostics after signed display URLs have
 * been generated. Names, ranks, roles, revenue and approved presentation config
 * remain unchanged. */
export function sanitizePublicManifest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePublicManifest);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isInternalKey(key))
      .map(([key, entry]) => [key, sanitizePublicManifest(entry)]),
  );
}

/** A release row and its immutable manifest must point to the exact same
 * reviewed snapshot. This prevents a stale/foreign manifest from being shared
 * merely because the surrounding release row references a validated batch. */
export function publicManifestMatchesRelease(
  manifest: unknown,
  importBatchId: string,
  periodId: string | null,
): boolean {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return false;
  }
  const value = manifest as Record<string, unknown>;
  if (value.import_batch_id !== importBatchId) return false;
  if (
    value.period_id !== undefined && value.period_id !== null &&
    value.period_id !== periodId
  ) {
    return false;
  }
  return true;
}

/** Public manifests contain fresh signed Storage URLs and are enriched from
 * the mutable employee photo directory. They must never be conditionally
 * cached by release id alone. */
export function publicManifestResponseHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store" };
}

export type RateWindow = { startedAt: number; count: number };

export function consumeRateLimit(
  windows: Map<string, RateWindow>,
  key: string,
  now: number,
  limit = 60,
  windowMs = 60_000,
): { allowed: boolean; retryAfterSeconds: number } {
  const previous = windows.get(key);
  if (!previous || now - previous.startedAt >= windowMs) {
    windows.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  previous.count += 1;
  if (previous.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((previous.startedAt + windowMs - now) / 1000),
    ),
  };
}
