import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireOperator, serviceClient } from "../_shared/auth.ts";
import { randomPairingCode, randomToken, sha256 } from "../_shared/crypto.ts";
import { findRejectedReportedReleaseId } from "../_shared/release-validation.ts";
import {
  consumeRateLimit,
  publicManifestEtag,
  publicManifestMatchesRelease,
  sanitizePublicManifest,
  type RateWindow,
} from "../_shared/public-manifest.ts";

type ScreenRequest = {
  action?: "register" | "status" | "manifest" | "public_manifest" | "heartbeat" | "registrations" | "approve" | "revoke";
  deviceId?: string;
  deviceName?: string;
  deviceType?: "android_tv" | "web" | "signage_box";
  appVersion?: string;
  currentReleaseId?: string | null;
  readyReleaseId?: string | null;
  currentItemKey?: string | null;
  lastError?: string | null;
  cacheState?: Record<string, unknown>;
  deviceInfo?: Record<string, unknown>;
  pairingCode?: string;
  screenId?: string;
  registrationId?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicManifestRateWindows = new Map<string, RateWindow>();

function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
}

function publicJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function bearerToken(request: Request): string {
  return (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

async function authorizedRegistration(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Error("DEVICE_UNAUTHORIZED");
  const tokenHash = await sha256(token);
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("device_registrations")
    .select("id,device_id,device_name,device_type,app_version,screen_id,status,expires_at,screen:screens(id,screen_code,name,branch_id,branch:branches(id,code,name,address))")
    .eq("device_token_hash", tokenHash)
    .maybeSingle();
  // A transient database/PostgREST failure must not look like an invalid
  // device token: Android clears its saved pairing only on a real 401.
  if (error) throw error;
  if (!data || data.status === "revoked") throw new Error("DEVICE_UNAUTHORIZED");
  if (data.status === "pending" && new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("device_registrations").update({ status: "expired" }).eq("id", data.id);
    throw new Error("PAIRING_EXPIRED");
  }
  return data;
}

async function signedManifest(manifest: Record<string, unknown>) {
  const supabase = serviceClient();
  const result = structuredClone(manifest);
  const items = (Array.isArray(result.items) ? result.items : result.playlist) as Array<Record<string, unknown>> | undefined;
  await Promise.all((items ?? []).map(async (item) => {
    const requestedBucket = typeof item.bucket === "string" ? item.bucket : "vinhdanh-media";
    if (requestedBucket !== "vinhdanh-media") {
      throw new Error("INVALID_MEDIA_BUCKET");
    }
    const mediaFields = [
      ["mediaPath", "media_path", "mediaUrl", "media_url"],
      ["backgroundPath", "background_path", "backgroundUrl", "background_url"],
      ["logoPath", "logo_path", "logoUrl", "logo_url"],
      ["thumbnailPath", "thumbnail_path", "thumbnailUrl", "thumbnail_url"],
    ] as const;
    await Promise.all(mediaFields.map(async ([camelPath, snakePath, camelUrl, snakeUrl]) => {
      const path = typeof item[camelPath] === "string"
        ? item[camelPath] as string
        : (typeof item[snakePath] === "string" ? item[snakePath] as string : null);
      if (!path) return;
      const { data, error } = await supabase.storage.from("vinhdanh-media")
        .createSignedUrl(path, 60 * 60 * 24);
      if (!error && data?.signedUrl) {
        item[camelUrl] = data.signedUrl;
        item[snakeUrl] = data.signedUrl;
      }
    }));

    const board = (item.recognitionBoard ?? item.recognition_board) as Record<string, unknown> | undefined;
    const entries = Array.isArray(board?.entries) ? board.entries as Array<Record<string, unknown>> : [];
    await Promise.all(entries.map(async (entry) => {
      const photoPath = typeof entry.photoPath === "string"
        ? entry.photoPath
        : (typeof entry.photo_path === "string"
          ? entry.photo_path
          : (typeof entry.avatarPath === "string" ? entry.avatarPath : null));
      if (!photoPath) return;
      const { data, error } = await supabase.storage.from("employee-photos")
        .createSignedUrl(photoPath, 60 * 60 * 24);
      if (!error && data?.signedUrl) {
        entry.avatarUrl = data.signedUrl;
        entry.avatar_url = data.signedUrl;
      }
    }));
  }));
  return result;
}

async function latestPublicManifest(request: Request): Promise<Response> {
  const nowMs = Date.now();
  if (publicManifestRateWindows.size > 5000) {
    for (const [key, window] of publicManifestRateWindows) {
      if (nowMs - window.startedAt > 60_000) publicManifestRateWindows.delete(key);
    }
  }
  const rate = consumeRateLimit(
    publicManifestRateWindows,
    requestIp(request),
    nowMs,
    60,
    60_000,
  );
  if (!rate.allowed) {
    return publicJsonResponse({ error: "RATE_LIMITED" }, 429, {
      "Cache-Control": "no-store",
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }

  const supabase = serviceClient();
  const now = new Date(nowMs).toISOString();
  const { data: releases, error: releaseError } = await supabase
    .from("releases")
    .select("id,release_version,period_id,import_batch_id,status,activate_at,manifest,published_at,updated_at")
    .eq("status", "published")
    .not("import_batch_id", "is", null)
    .contains("target_config", { scope: "all" })
    .or(`activate_at.is.null,activate_at.lte.${now}`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (releaseError) throw releaseError;

  const batchIds = [...new Set(
    (releases ?? [])
      .map((release) => release.import_batch_id)
      .filter((value): value is string => typeof value === "string"),
  )];
  let validatedBatchIds = new Set<string>();
  if (batchIds.length) {
    const { data: batches, error: batchError } = await supabase
      .from("import_batches")
      .select("id")
      .in("id", batchIds)
      .eq("status", "validated");
    if (batchError) throw batchError;
    validatedBatchIds = new Set((batches ?? []).map((batch) => batch.id));
  }
  const release = (releases ?? []).find((candidate) =>
    typeof candidate.import_batch_id === "string" &&
    validatedBatchIds.has(candidate.import_batch_id) &&
    publicManifestMatchesRelease(
      candidate.manifest,
      candidate.import_batch_id,
      candidate.period_id,
    )
  );
  if (!release) {
    return publicJsonResponse({
      release: null,
      serverTime: now,
    }, 200, {
      "Cache-Control": "public, max-age=10, s-maxage=10, stale-while-revalidate=30",
    });
  }

  const etag = publicManifestEtag(release.id, release.updated_at);
  const cacheHeaders = {
    "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    "ETag": etag,
    "Vary": "If-None-Match",
  };
  if (request.headers.get("if-none-match") === etag) {
    return publicJsonResponse(null, 304, cacheHeaders);
  }
  const signed = await signedManifest(release.manifest ?? {});
  return publicJsonResponse({
    release: {
      id: release.id,
      releaseVersion: release.release_version,
      periodId: release.period_id,
      status: "published",
      activateAt: release.activate_at,
      publishedAt: release.published_at,
      updatedAt: release.updated_at,
      manifest: sanitizePublicManifest(signed),
    },
    serverTime: now,
  }, 200, cacheHeaders);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST" && request.method !== "GET") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }
  try {
    const body = request.method === "GET"
      ? { action: new URL(request.url).searchParams.get("action") ?? undefined } as ScreenRequest
      : (await request.json().catch(() => ({}))) as ScreenRequest;
    if (body.action === "public_manifest") return await latestPublicManifest(request);
    if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
    const supabase = serviceClient();

    if (body.action === "registrations") {
      await requireOperator(request, ["super_admin", "admin", "publisher"]);
      await supabase.from("device_registrations")
        .update({ status: "expired" })
        .eq("status", "pending")
        .lt("expires_at", new Date().toISOString());
      const { data, error } = await supabase
        .from("device_registrations")
        .select("id,device_id,device_name,device_type,app_version,pairing_code,screen_id,status,expires_at,approved_at,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return jsonResponse({ registrations: data ?? [] });
    }

    if (body.action === "approve") {
      const operator = await requireOperator(request, ["super_admin", "admin", "publisher"]);
      if (!body.pairingCode || !body.screenId) {
        return jsonResponse({ error: "PAIRING_CODE_AND_SCREEN_ID_REQUIRED" }, 400);
      }
      const { data: registration, error: registrationError } = await supabase
        .from("device_registrations")
        .select("id,status,expires_at,device_id,device_name")
        .eq("pairing_code", body.pairingCode.trim())
        .single();
      if (registrationError || !registration) return jsonResponse({ error: "PAIRING_CODE_NOT_FOUND" }, 404);
      if (registration.status !== "pending") {
        return jsonResponse({ error: "REGISTRATION_NOT_PENDING", status: registration.status }, 409);
      }
      if (new Date(registration.expires_at).getTime() < Date.now()) {
        await supabase.from("device_registrations").update({ status: "expired" }).eq("id", registration.id);
        return jsonResponse({ error: "PAIRING_EXPIRED" }, 410);
      }
      const { data: screen, error: screenError } = await supabase
        .from("screens")
        .select("id,screen_code,name")
        .eq("id", body.screenId)
        .eq("is_active", true)
        .single();
      if (screenError || !screen) return jsonResponse({ error: "SCREEN_NOT_FOUND" }, 404);

      const approvedAt = new Date().toISOString();
      const { error: approveError } = await supabase.from("device_registrations").update({
        screen_id: screen.id,
        status: "approved",
        approved_by: operator.userId,
        approved_at: approvedAt,
      }).eq("id", registration.id);
      if (approveError) throw approveError;
      const { error: stateError } = await supabase.from("screen_state").upsert({
        screen_id: screen.id,
        connection_state: "offline",
      }, { onConflict: "screen_id" });
      if (stateError) throw stateError;
      await supabase.from("audit_logs").insert({
        actor_id: operator.userId,
        action: "device.approve",
        entity_type: "device_registration",
        entity_id: registration.id,
        after_data: { deviceId: registration.device_id, screenId: screen.id, approvedAt },
      });
      return jsonResponse({ ok: true, registrationId: registration.id, screen, approvedAt });
    }

    if (body.action === "revoke") {
      const operator = await requireOperator(request, ["super_admin", "admin"]);
      if (!body.registrationId) return jsonResponse({ error: "REGISTRATION_ID_REQUIRED" }, 400);
      const { data, error } = await supabase.from("device_registrations")
        .update({ status: "revoked", screen_id: null })
        .eq("id", body.registrationId)
        .select("id,device_id")
        .single();
      if (error || !data) return jsonResponse({ error: "REGISTRATION_NOT_FOUND" }, 404);
      await supabase.from("audit_logs").insert({
        actor_id: operator.userId,
        action: "device.revoke",
        entity_type: "device_registration",
        entity_id: data.id,
        after_data: { deviceId: data.device_id },
      });
      return jsonResponse({ ok: true, registrationId: data.id });
    }

    if (body.action === "register") {
      if (!body.deviceId) return jsonResponse({ error: "DEVICE_ID_REQUIRED" }, 400);
      const { data: existing, error: existingError } = await supabase
        .from("device_registrations")
        .select("id,status")
        .eq("device_id", body.deviceId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.status === "approved") {
        return jsonResponse({ error: "DEVICE_ALREADY_APPROVED" }, 409);
      }
      if (existing?.status === "revoked") {
        return jsonResponse({ error: "DEVICE_REVOKED" }, 403);
      }
      const rawToken = randomToken(32);
      const pairingCode = randomPairingCode();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("device_registrations")
        .upsert({
          device_id: body.deviceId,
          device_token_hash: await sha256(rawToken),
          pairing_code: pairingCode,
          device_name: body.deviceName ?? "TV chưa đặt tên",
          device_type: body.deviceType ?? "android_tv",
          app_version: body.appVersion,
          screen_id: null,
          status: "pending",
          expires_at: expiresAt,
          approved_by: null,
          approved_at: null,
        }, { onConflict: "device_id" })
        .select("id,status,expires_at")
        .single();
      if (error) throw error;
      return jsonResponse({
        registrationId: data.id,
        pairingCode,
        deviceToken: rawToken,
        status: data.status,
        expiresAt: data.expires_at,
      }, 201);
    }

    const registration = await authorizedRegistration(request);
    if (body.action === "status") {
      return jsonResponse({
        status: registration.status,
        screenId: registration.screen_id,
        screen: registration.screen ?? null,
        expiresAt: registration.expires_at,
      });
    }
    if (registration.status !== "approved" || !registration.screen_id) {
      return jsonResponse({ error: "DEVICE_NOT_APPROVED", status: registration.status }, 409);
    }

    if (body.action === "heartbeat") {
      const now = new Date().toISOString();
      for (const [fieldName, value] of [
        ["currentReleaseId", body.currentReleaseId],
        ["readyReleaseId", body.readyReleaseId],
      ] as const) {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || !uuidPattern.test(value.trim()))
        ) {
          return jsonResponse({ error: "INVALID_RELEASE_ID", field: fieldName }, 400);
        }
      }

      const currentReleaseId = typeof body.currentReleaseId === "string"
        ? body.currentReleaseId.trim().toLowerCase()
        : null;
      const readyReleaseId = typeof body.readyReleaseId === "string"
        ? body.readyReleaseId.trim().toLowerCase()
        : null;
      const reportedReleaseIds = [...new Set(
        [currentReleaseId, readyReleaseId].filter((value): value is string => Boolean(value)),
      )];

      if (reportedReleaseIds.length) {
        const [
          { data: releases, error: releasesError },
          { data: targets, error: targetsError },
          { data: existingState, error: stateReadError },
        ] =
          await Promise.all([
            supabase.from("releases")
              .select("id,status,activate_at")
              .in("id", reportedReleaseIds),
            supabase.from("release_targets")
              .select("release_id")
              .eq("screen_id", registration.screen_id)
              .in("release_id", reportedReleaseIds),
            supabase.from("screen_state")
              .select("desired_release_id,current_release_id")
              .eq("screen_id", registration.screen_id)
              .maybeSingle(),
          ]);
        if (releasesError) throw releasesError;
        if (targetsError) throw targetsError;
        if (stateReadError) throw stateReadError;

        const rejectedReleaseId = findRejectedReportedReleaseId({
          currentReleaseId,
          readyReleaseId,
          desiredReleaseId: existingState?.desired_release_id ?? null,
          existingCurrentReleaseId: existingState?.current_release_id ?? null,
          releaseStates: Object.fromEntries(
            (releases ?? []).map((release) => [release.id, {
              status: release.status,
              activateAt: release.activate_at,
            }]),
          ),
          targetedReleaseIds: (targets ?? []).map((target) => target.release_id),
          serverTimeMs: Date.parse(now),
        });
        if (rejectedReleaseId) {
          return jsonResponse({
            error: "REPORTED_RELEASE_NOT_PUBLISHED_OR_TARGETED",
            releaseId: rejectedReleaseId,
          }, 409);
        }
      }

      if (readyReleaseId) {
        const { data: readyTarget, error: readyError } = await supabase.from("release_targets")
          .update({ delivery_status: "ready" })
          .eq("screen_id", registration.screen_id)
          .eq("release_id", readyReleaseId)
          .select("id")
          .maybeSingle();
        if (readyError) throw readyError;
        if (!readyTarget) return jsonResponse({ error: "RELEASE_TARGET_CHANGED" }, 409);
        const { error: readyAtError } = await supabase.from("release_targets")
          .update({ ready_at: now })
          .eq("screen_id", registration.screen_id)
          .eq("release_id", readyReleaseId)
          .is("ready_at", null);
        if (readyAtError) throw readyAtError;
      }
      if (currentReleaseId) {
        const { data: activeTarget, error: activeError } = await supabase.from("release_targets")
          .update({ delivery_status: "active" })
          .eq("screen_id", registration.screen_id)
          .eq("release_id", currentReleaseId)
          .select("id")
          .maybeSingle();
        if (activeError) throw activeError;
        if (!activeTarget) return jsonResponse({ error: "RELEASE_TARGET_CHANGED" }, 409);
        // activated_at is the first successful activation, not the latest
        // heartbeat. A repeated heartbeat therefore updates zero timestamp rows
        // and still succeeds.
        const { error: activatedAtError } = await supabase.from("release_targets")
          .update({ activated_at: now })
          .eq("screen_id", registration.screen_id)
          .eq("release_id", currentReleaseId)
          .is("activated_at", null);
        if (activatedAtError) throw activatedAtError;
      }

      const { error } = await supabase.from("screen_state").upsert({
        screen_id: registration.screen_id,
        current_release_id: currentReleaseId,
        ready_release_id: readyReleaseId,
        current_item_key: body.currentItemKey ?? null,
        connection_state: body.lastError ? "error" : "online",
        last_seen_at: now,
        last_error: body.lastError ?? null,
        app_version: body.appVersion ?? registration.app_version,
        cache_state: body.cacheState ?? {},
        device_info: body.deviceInfo ?? {},
      }, { onConflict: "screen_id" });
      if (error) throw error;
      return jsonResponse({ ok: true, serverTime: now });
    }

    if (body.action === "manifest") {
      const { data: state, error: stateError } = await supabase
        .from("screen_state")
        .select("desired_release_id,current_release_id")
        .eq("screen_id", registration.screen_id)
        .maybeSingle();
      if (stateError) throw stateError;
      if (!state?.desired_release_id) return jsonResponse({ release: null, serverTime: new Date().toISOString() });
      const { data: target, error: targetError } = await supabase
        .from("release_targets")
        .select("id")
        .eq("release_id", state.desired_release_id)
        .eq("screen_id", registration.screen_id)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) {
        return jsonResponse({
          release: null,
          currentReleaseId: state.current_release_id,
          screenId: registration.screen_id,
          screen: registration.screen ?? null,
          serverTime: new Date().toISOString(),
        });
      }
      const { data: release, error: releaseError } = await supabase
        .from("releases")
        .select("id,release_version,period_id,status,activate_at,manifest,updated_at")
        .eq("id", state.desired_release_id)
        .eq("status", "published")
        .maybeSingle();
      if (releaseError) throw releaseError;
      // Published releases may be returned before activate_at so Android TV can
      // pre-download and cache all media. The player must keep its current
      // release active until activate_at; unpublished candidates are never
      // returned to a device.
      if (!release) {
        return jsonResponse({
          release: null,
          currentReleaseId: state.current_release_id,
          screenId: registration.screen_id,
          screen: registration.screen ?? null,
          serverTime: new Date().toISOString(),
        });
      }
      return jsonResponse({
        release: { ...release, manifest: await signedManifest(release.manifest ?? {}) },
        currentReleaseId: state.current_release_id,
        screenId: registration.screen_id,
        screen: registration.screen ?? null,
        serverTime: new Date().toISOString(),
      });
    }

    return jsonResponse({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "DEVICE_UNAUTHORIZED") return jsonResponse({ error: message }, 401);
    if (message === "PAIRING_EXPIRED") return jsonResponse({ error: message }, 410);
    if (message === "UNAUTHORIZED") return jsonResponse({ error: message }, 401);
    if (message === "FORBIDDEN") return jsonResponse({ error: message }, 403);
    return jsonResponse({ error: "SCREEN_API_FAILED", message }, 500);
  }
});
