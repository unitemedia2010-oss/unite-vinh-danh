import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireOperator, serviceClient } from "../_shared/auth.ts";
import { resolvePublishTargetScope } from "../_shared/release-validation.ts";

type PublishRequest = {
  releaseId?: string;
  activateAt?: string | null;
  targetScope?: "all" | "screenIds" | "branchIds";
  screenIds?: string[];
  branchIds?: string[];
};

type PublishRpcResult = {
  releaseId: string;
  releaseVersion: string;
  activateAt: string;
  targetScope: Record<string, unknown>;
  targetScreenIds: string[];
  targets: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuidList(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`INVALID_${fieldName.toUpperCase()}`);
  const normalized = value.map((entry) => {
    if (typeof entry !== "string" || !uuidPattern.test(entry.trim())) {
      throw new Error(`INVALID_${fieldName.toUpperCase()}`);
    }
    return entry.trim().toLowerCase();
  });
  return [...new Set(normalized)];
}

const publishConflictCodes = new Set([
  "RELEASE_NOT_READY",
  "IMPORT_BATCH_NOT_FOUND",
  "IMPORT_BATCH_NOT_VALIDATED",
  "TARGET_SCREEN_NOT_ACTIVE",
  "TARGET_BRANCH_NOT_ACTIVE",
  "TARGET_BRANCH_WITHOUT_ACTIVE_SCREEN",
  "NO_TARGET_SCREENS",
  "RELEASE_STATE_CHANGED",
]);

function rpcErrorResponse(message: string, details?: string) {
  if (message === "ACTOR_NOT_AUTHORIZED") return jsonResponse({ error: message }, 403);
  if (message === "RELEASE_NOT_FOUND") return jsonResponse({ error: message }, 404);
  if (
    message === "INVALID_TARGET_SCOPE" ||
    message === "TARGET_SCOPE_MISMATCH" ||
    message === "TARGET_IDS_CONTAIN_NULL"
  ) {
    return jsonResponse({ error: message, details }, 400);
  }
  if (publishConflictCodes.has(message)) {
    return jsonResponse({ error: message, details }, 409);
  }
  return jsonResponse({ error: "PUBLISH_TRANSACTION_FAILED", message, details }, 500);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const operator = await requireOperator(request, ["super_admin", "admin", "publisher"]);
    const body = (await request.json().catch(() => ({}))) as PublishRequest;
    if (!body.releaseId) return jsonResponse({ error: "RELEASE_ID_REQUIRED" }, 400);
    if (!uuidPattern.test(body.releaseId)) return jsonResponse({ error: "INVALID_RELEASE_ID" }, 400);
    if (!operator.userId) return jsonResponse({ error: "FORBIDDEN" }, 403);

    const hasScreenIds = Object.prototype.hasOwnProperty.call(body, "screenIds");
    const hasBranchIds = Object.prototype.hasOwnProperty.call(body, "branchIds");

    let screenIds: string[];
    let branchIds: string[];
    try {
      screenIds = normalizeUuidList(body.screenIds, "screen_ids");
      branchIds = normalizeUuidList(body.branchIds, "branch_ids");
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "INVALID_TARGET_IDS" }, 400);
    }
    let activateAt: string | null = null;
    if (body.activateAt !== undefined && body.activateAt !== null) {
      if (typeof body.activateAt !== "string" || !Number.isFinite(Date.parse(body.activateAt))) {
        return jsonResponse({ error: "INVALID_ACTIVATE_AT" }, 400);
      }
      activateAt = new Date(body.activateAt).toISOString();
    }

    const targetResolution = resolvePublishTargetScope({
      requestedScope: body.targetScope,
      hasScreenIds,
      hasBranchIds,
      screenCount: screenIds.length,
      branchCount: branchIds.length,
    });
    if (targetResolution.error) return jsonResponse({ error: targetResolution.error }, 400);
    const targetScope = targetResolution.scope;

    const supabase = serviceClient();
    const { data: rpcData, error: rpcError } = await supabase.rpc("publish_vinhdanh_release", {
      p_release_id: body.releaseId,
      p_actor_id: operator.userId,
      p_activate_at: activateAt,
      p_target_scope: targetScope,
      p_screen_ids: screenIds,
      p_branch_ids: branchIds,
    });
    if (rpcError) return rpcErrorResponse(rpcError.message, rpcError.details);
    if (!rpcData || typeof rpcData !== "object" || Array.isArray(rpcData)) {
      return jsonResponse({ error: "INVALID_PUBLISH_TRANSACTION_RESULT" }, 500);
    }
    const published = rpcData as PublishRpcResult;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let broadcastAccepted = false;
    let broadcastError: string | null = null;
    try {
      const broadcastResponse = await fetch(
        `${supabaseUrl}/realtime/v1/api/broadcast/screen-updates/events/release-published`,
        {
          method: "POST",
          headers: { apikey: serviceRoleKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            releaseId: published.releaseId,
            releaseVersion: published.releaseVersion,
            activateAt: published.activateAt,
          }),
        },
      );
      broadcastAccepted = broadcastResponse.ok;
      if (!broadcastResponse.ok) broadcastError = `HTTP_${broadcastResponse.status}`;
    } catch (error) {
      broadcastError = error instanceof Error ? error.message : String(error);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_id: operator.userId,
      action: "release.publish",
      entity_type: "release",
      entity_id: published.releaseId,
      after_data: {
        activateAt: published.activateAt,
        targetScope: published.targetScope,
        targetScreenIds: published.targetScreenIds,
      },
      metadata: {
        targetCount: published.targets,
        broadcastAccepted,
        broadcastError,
      },
    });

    return jsonResponse({
      ok: true,
      releaseId: published.releaseId,
      releaseVersion: published.releaseVersion,
      activateAt: published.activateAt,
      targets: published.targets,
      targetScreenIds: published.targetScreenIds,
      broadcastAccepted,
      auditRecorded: !auditError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return jsonResponse({ error: message }, 401);
    if (message === "FORBIDDEN") return jsonResponse({ error: message }, 403);
    return jsonResponse({ error: "PUBLISH_FAILED", message }, 500);
  }
});
