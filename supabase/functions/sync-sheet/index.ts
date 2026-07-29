import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireOperator, serviceClient } from "../_shared/auth.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sha256 } from "../_shared/crypto.ts";
import {
  BEST_TEAM_CONTRIBUTION_VERSION,
  deriveBestTeamContributions,
} from "../_shared/best-team.ts";
import { deriveQlcnAwards, QLCN_DERIVATION_VERSION } from "../_shared/qlcn.ts";
import {
  deriveTeamAwardsFromContributions,
  TEAM_DERIVATION_VERSION,
} from "../_shared/team.ts";
import {
  deriveLeaderAwards,
  LEADER_DERIVATION_VERSION,
} from "../_shared/leader.ts";
import {
  fetchPublicSheetCsv,
  normalizeSheetRows,
  normalizeText,
  type SheetMapping,
} from "../_shared/sheet.ts";
import { reconcileRecognitionSourceTotals } from "../_shared/reconciliation.ts";
import { resolveSheetPeriod } from "../_shared/sheet-period.ts";
import {
  normalizeSheetTrigger,
  resolveImportStatus,
} from "../_shared/sync-policy.ts";
import {
  employeePhotoHashSnapshot,
  indexEmployeePhotoRows,
  normalizeEmployeeCode,
  type EmployeePhotoRow,
} from "../_shared/employee-photo.ts";

type SyncRequest = {
  sourceId?: string;
  spreadsheetId?: string;
  periodId?: string;
  force?: boolean;
  trigger?: unknown;
};

type AutomaticReleaseResult = {
  unchanged: boolean;
  releaseId: string;
  releaseVersion: string;
  activateAt: string;
  targets: number;
  targetScreenIds: string[];
  broadcastAccepted: boolean;
  broadcastError: string | null;
};

/**
 * Creation, targeting and publication happen inside one database transaction.
 * If it fails, every TV keeps the previous desired release.
 */
async function autoPublishValidatedBatch(
  supabase: SupabaseClient,
  batchId: string,
): Promise<AutomaticReleaseResult> {
  const { data, error } = await supabase.rpc(
    "auto_publish_vinhdanh_import_batch",
    { p_batch_id: batchId },
  );
  if (error) throw new Error(`AUTO_PUBLISH_FAILED: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("AUTO_PUBLISH_INVALID_RESULT");
  }
  const result = data as Record<string, unknown>;
  if (
    typeof result.releaseId !== "string" ||
    typeof result.releaseVersion !== "string" ||
    typeof result.activateAt !== "string" ||
    typeof result.targets !== "number" ||
    !Array.isArray(result.targetScreenIds)
  ) {
    throw new Error("AUTO_PUBLISH_INVALID_RESULT");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let broadcastAccepted = false;
  let broadcastError: string | null = null;
  // Broadcast is only an accelerator. Heartbeat/manifest polling still sees
  // desired_release_id when Realtime is temporarily unavailable.
  try {
    const response = await fetch(
      `${supabaseUrl}/realtime/v1/api/broadcast/screen-updates/events/release-published`,
      {
        method: "POST",
        headers: { apikey: serviceRoleKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseId: result.releaseId,
          releaseVersion: result.releaseVersion,
          activateAt: result.activateAt,
          automatic: true,
        }),
      },
    );
    broadcastAccepted = response.ok;
    if (!response.ok) broadcastError = `HTTP_${response.status}`;
  } catch (error) {
    broadcastError = error instanceof Error ? error.message : String(error);
  }

  return {
    unchanged: result.unchanged === true,
    releaseId: result.releaseId,
    releaseVersion: result.releaseVersion,
    activateAt: result.activateAt,
    targets: result.targets,
    targetScreenIds: (result.targetScreenIds as unknown[]).filter(
      (value): value is string => typeof value === "string",
    ),
    broadcastAccepted,
    broadcastError,
  };
}

async function loadEmployeePhotoPaths(
  supabase: SupabaseClient,
  employeeCodes: string[],
): Promise<Map<string, string | null>> {
  const queryCodes = [...new Set(employeeCodes.flatMap((value) => {
    const original = value.trim();
    const normalized = normalizeEmployeeCode(value);
    return [original, normalized].filter(Boolean);
  }))];
  if (!queryCodes.length) return new Map();

  const rows: EmployeePhotoRow[] = [];
  for (let offset = 0; offset < queryCodes.length; offset += 200) {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_code,photo_path")
      .in("employee_code", queryCodes.slice(offset, offset + 200));
    if (error) throw error;
    rows.push(...((data ?? []) as EmployeePhotoRow[]));
  }
  return indexEmployeePhotoRows(rows);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let batchId: string | null = null;
  try {
    const operator = await requireOperator(
      request,
      ["super_admin", "admin", "accounting", "publisher"],
      { allowScheduleSecret: true },
    );
    const body = (await request.json().catch(() => ({}))) as SyncRequest;
    if (operator.scheduled && body.force) {
      return jsonResponse({ error: "SCHEDULE_FORCE_NOT_ALLOWED" }, 400);
    }
    const trigger = normalizeSheetTrigger(body.trigger, operator.scheduled);
    const supabase = serviceClient();

    let sourceQuery = supabase.from("sheet_sources").select("*").eq(
      "is_active",
      true,
    );
    if (body.sourceId) sourceQuery = sourceQuery.eq("id", body.sourceId);
    else if (body.spreadsheetId) {
      sourceQuery = sourceQuery.eq("spreadsheet_id", body.spreadsheetId);
    } else {sourceQuery = sourceQuery.order("created_at", { ascending: true })
        .limit(1);}
    const { data: sourceRows, error: sourceError } = await sourceQuery.limit(1);
    if (sourceError) throw sourceError;
    const source = sourceRows?.[0];
    if (!source) return jsonResponse({ error: "SHEET_SOURCE_NOT_FOUND" }, 404);

    if (source.final_cell && !body.force) {
      const cellMatrix = await fetchPublicSheetCsv(
        source.spreadsheet_id,
        source.config?.finalSheet ?? "DS-KV",
        source.final_cell,
      );
      const finalValue = cellMatrix.flat().find((value) =>
        value?.trim()
      )?.trim() ?? "";
      if (
        finalValue.toUpperCase() !==
          String(source.final_value ?? "FINAL").toUpperCase()
      ) {
        return jsonResponse({
          error: "SOURCE_NOT_FINAL",
          currentValue: finalValue,
        }, 409);
      }
    }

    const { data: mappingRows, error: mappingError } = await supabase
      .from("sheet_mappings")
      .select("*")
      .eq("source_id", source.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (mappingError) throw mappingError;
    if (!mappingRows?.length) {
      return jsonResponse({ error: "NO_ACTIVE_MAPPINGS" }, 409);
    }

    const snapshots = [];
    const allRows: Array<
      {
        mapping: SheetMapping;
        normalized: ReturnType<typeof normalizeSheetRows>;
      }
    > = [];
    const warnings: Array<Record<string, unknown>> = [];
    const blockingErrors: Array<Record<string, unknown>> = [];
    const periods = new Set<string>();

    for (const mapping of mappingRows as SheetMapping[]) {
      if (source.auth_mode !== "public") {
        throw new Error("SERVICE_ACCOUNT_MODE_NOT_CONFIGURED");
      }
      const matrix = await fetchPublicSheetCsv(
        source.spreadsheet_id,
        mapping.sheet_name,
        mapping.range_a1,
        mapping.header_row,
      );
      const normalized = normalizeSheetRows(matrix, mapping);
      if (normalized.periodId) periods.add(normalized.periodId);
      normalized.warnings.forEach((message) =>
        warnings.push({ mapping: mapping.code, message })
      );
      normalized.blockingErrors.forEach((message) =>
        blockingErrors.push({ mapping: mapping.code, message })
      );
      normalized.rows.forEach((row) => {
        row.validationMessages.forEach((message) => {
          warnings.push({
            mapping: mapping.code,
            row: row.sourceRowNumber,
            entityCode: row.entityCode,
            message,
          });
        });
      });
      if (
        mapping.filter_config?.requiresRevenueSelection &&
        !mapping.filter_config?.selectedRevenueField
      ) {
        warnings.push({
          mapping: mapping.code,
          message: "Cần Admin chọn cột doanh số xét vinh danh.",
        });
      }
      snapshots.push({
        mappingCode: mapping.code,
        title: normalized.title,
        headers: normalized.headers,
        rows: normalized.rows,
      });
      allRows.push({ mapping, normalized });
    }

    if (blockingErrors.length) {
      return jsonResponse({
        error: "SOURCE_SCHEMA_INVALID",
        message:
          "Sheet thiếu hoặc trùng cột bắt buộc; không tạo bản nhập để tránh xếp hạng sai.",
        blockingErrors,
        warnings,
      }, 409);
    }

    const periodResolution = resolveSheetPeriod(periods, body.periodId);
    if (!periodResolution.ok) {
      const messages = {
        PERIOD_NOT_FOUND: "Không xác định được kỳ từ cột doanh số Sheet.",
        SOURCE_PERIOD_CONFLICT:
          "Tháng của cột doanh số bắt buộc đang khác nhau giữa các tab; không tạo bản nhập.",
        REQUEST_PERIOD_MISMATCH:
          "Kỳ do người gọi truyền vào khác kỳ được phát hiện từ cột doanh số Sheet.",
      } as const;
      return jsonResponse({
        error: periodResolution.error,
        message: messages[periodResolution.error],
        periods: periodResolution.periods,
        requestedPeriodId: periodResolution.requestedPeriodId,
      }, 409);
    }
    const periodId = periodResolution.periodId;

    const photoCandidateCodes = allRows
      .filter(({ mapping }) => mapping.code === "DS_KV" || mapping.code === "DS_TEAM")
      .flatMap(({ normalized }) => normalized.rows.map((row) => row.entityCode ?? ""))
      .filter(Boolean);
    const employeePhotoPaths = await loadEmployeePhotoPaths(
      supabase,
      photoCandidateCodes,
    );

    const sourceHash = await sha256(JSON.stringify({
      snapshots,
      employeePhotos: employeePhotoHashSnapshot(
        photoCandidateCodes,
        employeePhotoPaths,
      ),
      derivationVersions: {
        bestTeam: BEST_TEAM_CONTRIBUTION_VERSION,
        qlcn: QLCN_DERIVATION_VERSION,
        team: TEAM_DERIVATION_VERSION,
        leader: LEADER_DERIVATION_VERSION,
      },
    }));
    const { data: startResultRaw, error: startError } = await supabase.rpc(
      "start_vinhdanh_import_batch",
      {
        p_source_id: source.id,
        p_period_id: periodId,
        p_source_hash: sourceHash,
        p_imported_by: operator.userId,
        p_metadata: {
          trigger,
          sourceName: source.name,
          automaticRelease: true,
        },
        p_allow_duplicate: body.force === true,
      },
    );
    if (startError) throw startError;
    const startResult = startResultRaw as {
      unchanged?: boolean;
      batch?: {
        id: string;
        period_id: string;
        sequence: number;
        status: string;
        source_hash: string;
      };
    } | null;
    if (!startResult?.batch?.id) throw new Error("INVALID_IMPORT_START_RESULT");
    if (startResult.unchanged) {
      if (startResult.batch.status === "importing") {
        return jsonResponse({
          error: "SYNC_ALREADY_IN_PROGRESS",
          batch: startResult.batch,
          periodId,
          sourceHash,
        }, 409);
      }
      const automaticRelease = startResult.batch.status === "validated"
        ? await autoPublishValidatedBatch(supabase, startResult.batch.id)
        : null;
      return jsonResponse({
        unchanged: true,
        batch: startResult.batch,
        periodId,
        sourceHash,
        automaticRelease,
      });
    }
    const batch = startResult.batch;
    const sequence = Number(batch.sequence);
    batchId = batch.id;

    const { error: snapshotError } = await supabase
      .from("import_batches")
      .update({ raw_snapshot: snapshots })
      .eq("id", batch.id)
      .eq("status", "importing");
    if (snapshotError) throw snapshotError;

    const insertRows = [];
    const seenEntities = new Map<string, number>();
    for (const { mapping, normalized } of allRows) {
      for (const row of normalized.rows) {
        const duplicateKey =
          mapping.code === "DS_KV" && row.entityCode && row.branchCode
            ? `${mapping.code}:${normalizeText(row.branchCode)}:${
              normalizeText(row.entityCode)
            }`
            : mapping.code === "DS_TEAM" && row.branchCode && row.teamCode
            ? `${mapping.code}:${normalizeText(row.branchCode)}:${
              normalizeText(row.teamCode)
            }`
            : row.entityCode
            ? `${mapping.code}:${normalizeText(row.entityCode)}`
            : "";
        if (duplicateKey) {
          seenEntities.set(
            duplicateKey,
            (seenEntities.get(duplicateKey) ?? 0) + 1,
          );
        }
        insertRows.push({
          batch_id: batch.id,
          mapping_id: mapping.id,
          source_row_key: row.sourceRowKey,
          source_row_number: row.sourceRowNumber,
          entity_type: row.entityType,
          entity_code: row.entityCode,
          display_name: row.displayName,
          branch_code: row.branchCode,
          team_code: row.teamCode,
          role_code: row.roleCode,
          source_rank: row.sourceRank,
          source_board_code: row.sourceBoardCode,
          revenue_vnd: row.revenueVnd,
          display_revenue: row.displayRevenue,
          metrics: row.metrics,
          raw_data: row.rawData,
          row_hash: await sha256(JSON.stringify(row.rawData)),
          validation_status: row.validationStatus,
          validation_messages: row.validationMessages,
        });
      }
    }

    for (const [key, count] of seenEntities.entries()) {
      if (count > 1) {
        warnings.push({
          message: "Mã xuất hiện nhiều dòng trong cùng bảng.",
          key,
          count,
        });
      }
    }
    for (let offset = 0; offset < insertRows.length; offset += 500) {
      const { error } = await supabase.from("import_rows").insert(
        insertRows.slice(offset, offset + 500),
      );
      if (error) throw error;
    }

    const managerRows = allRows.find(({ mapping }) =>
      mapping.code === "DS_KV"
    )?.normalized.rows ?? [];
    const teamRows = allRows.find(({ mapping }) =>
      mapping.code === "DS_TEAM"
    )?.normalized.rows ?? [];
    const bestTeam = deriveBestTeamContributions(teamRows);
    const qlcn = deriveQlcnAwards(managerRows, 3);
    const team = deriveTeamAwardsFromContributions(bestTeam, 10);
    const leader = deriveLeaderAwards(teamRows, 10);
    const reconciliation = reconcileRecognitionSourceTotals(
      managerRows,
      teamRows,
    );
    const {
      managerMetricTotalVnd,
      bestTeamMetricTotalVnd,
      differenceVnd,
    } = reconciliation;
    if (reconciliation.warning) {
      warnings.push({
        category: "RECONCILIATION",
        ...reconciliation.warning,
      });
    }
    bestTeam.warnings.forEach((warning) =>
      warnings.push({ category: "BEST_TEAM", ...warning })
    );
    qlcn.warnings.forEach((warning) =>
      warnings.push({ category: "QLCN", ...warning })
    );
    qlcn.candidates.filter((candidate) => candidate.needsReview).forEach(
      (candidate) => {
        warnings.push({
          category: "QLCN",
          manager: candidate.displayName,
          entityCode: candidate.entityCode,
          regions: candidate.regionCodes,
          message: candidate.validationMessages.join("; "),
        });
      },
    );
    team.warnings.forEach((warning) =>
      warnings.push({ category: "TEAM", ...warning })
    );
    team.candidates.filter((candidate) => candidate.needsReview).forEach(
      (candidate) => {
        warnings.push({
          category: "TEAM",
          team: candidate.displayName,
          region: candidate.regionCode,
          message: candidate.validationMessages.join("; "),
        });
      },
    );
    leader.warnings.forEach((warning) =>
      warnings.push({ category: "LEADER", ...warning })
    );
    leader.candidates.filter((candidate) => candidate.needsReview).forEach(
      (candidate) => {
        warnings.push({
          category: "LEADER",
          leader: candidate.displayName,
          entityCode: candidate.employeeCode,
          message: candidate.validationMessages.join("; "),
        });
      },
    );

    const boardCodes = [
      ...new Set([
        ...qlcn.awards.map((award) => award.tierCode),
        ...leader.awards.map((award) => award.tierCode),
        ...(team.awards.length ? ["TEAM_RANKING"] : []),
      ]),
    ];
    let boardRows: Array<{ id: string; code: string }> = [];
    if (boardCodes.length) {
      const { data, error } = await supabase
        .from("award_boards")
        .select("id,code")
        .in("code", boardCodes);
      if (error) throw error;
      boardRows = data ?? [];
    }
    const boardIds = new Map(boardRows.map((board) => [board.code, board.id]));
    const qlcnAwardResults = qlcn.awards.flatMap((award) => {
      const boardId = boardIds.get(award.tierCode);
      if (!boardId) {
        warnings.push({
          category: "QLCN",
          message: `Không tìm thấy award_board ${award.tierCode}.`,
        });
        return [];
      }
      return [{
        batch_id: batch.id,
        board_id: boardId,
        entity_type: "branch_manager",
        entity_code: award.entityCode,
        rank: award.rank,
        display_name: award.displayName,
        branch_code: award.regionCodes[0] ?? null,
        role_label: award.roleCode,
        revenue_vnd: award.revenueVnd,
        display_revenue: award.displayRevenue,
        photo_path: employeePhotoPaths.get(
          normalizeEmployeeCode(award.entityCode),
        ) ?? null,
        needs_review: award.needsReview,
        metadata: {
          calculation:
            "DS-KV.TỔNG GDTC+HC Tn per source row/region; manual Bảng Đấu",
          managerKey: award.managerKey,
          regionCodes: award.regionCodes,
          branchBreakdown: award.branchBreakdown,
          managerSourceRowKeys: award.managerSourceRowKeys,
          sourceRowKeys: award.sourceRowKeys,
          boardSource: award.boardSource,
          derivationVersion: QLCN_DERIVATION_VERSION,
          validationMessages: award.validationMessages,
        },
      }];
    });
    const teamBoardId = boardIds.get("TEAM_RANKING");
    if (team.awards.length && !teamBoardId) {
      warnings.push({
        category: "TEAM",
        message: "Không tìm thấy award_board TEAM_RANKING.",
      });
    }
    const teamAwardResults = teamBoardId
      ? team.awards.map((award) => ({
        batch_id: batch.id,
        board_id: teamBoardId,
        entity_type: "team",
        entity_code: award.entityCode,
        rank: award.rank,
        display_name: award.displayName,
        branch_code: award.regionCode,
        team_code: award.teamCode,
        role_label: award.leaderName,
        revenue_vnd: award.revenueVnd,
        display_revenue: award.displayRevenue,
        needs_review: award.needsReview,
        metadata: {
          calculation: "DS-TEAM.GDTC XÉT BEST TEAM ranked company-wide",
          teamKey: award.teamKey,
          leaderCode: award.leaderCode,
          leaderName: award.leaderName,
          leaderRoleCode: award.roleCode,
          sourceRowKey: award.sourceRowKey,
          sourceRowNumber: award.sourceRowNumber,
          bestTeamContributionVersion: BEST_TEAM_CONTRIBUTION_VERSION,
          derivationVersion: TEAM_DERIVATION_VERSION,
          validationMessages: award.validationMessages,
        },
      }))
      : [];
    const leaderAwardResults = leader.awards.flatMap((award) => {
      const boardId = boardIds.get(award.tierCode);
      if (!boardId) {
        warnings.push({
          category: "LEADER",
          message: `Không tìm thấy award_board ${award.tierCode}.`,
        });
        return [];
      }
      return [{
        batch_id: batch.id,
        board_id: boardId,
        entity_type: "leader",
        entity_code: award.employeeCode,
        rank: award.rank,
        display_name: award.displayName,
        branch_code: award.branchCodes.join("+"),
        team_code: award.teamCodes.join("+"),
        role_label: award.roleCode,
        revenue_vnd: award.revenueVnd,
        display_revenue: award.displayRevenue,
        photo_path: employeePhotoPaths.get(
          normalizeEmployeeCode(award.employeeCode),
        ) ?? null,
        needs_review: award.needsReview,
        metadata: {
          calculation:
            "SUM(DS-TEAM.GDTC XÉT BEST TEAM) per Leader MNV; manual Bảng Đấu",
          boardSource: award.boardSource,
          branchCodes: award.branchCodes,
          teamCodes: award.teamCodes,
          sourceRowKeys: award.sourceRowKeys,
          metricSources: award.metricSources,
          derivationVersion: LEADER_DERIVATION_VERSION,
          validationMessages: award.validationMessages,
        },
      }];
    });
    const awardResults = [
      ...qlcnAwardResults,
      ...leaderAwardResults,
      ...teamAwardResults,
    ];
    if (awardResults.length) {
      const { error: awardsError } = await supabase.from("award_results")
        .insert(awardResults);
      if (awardsError) throw awardsError;
    }

    const unresolvedCategories =
      Array.isArray(source.config?.unresolvedCategories)
        ? source.config.unresolvedCategories as string[]
        : [];
    unresolvedCategories.forEach((category) =>
      warnings.push({
        category,
        message:
          `${category} chưa có bảng kết quả/cột doanh số được xác nhận trong workbook hiện tại.`,
      })
    );

    const finalStatus = resolveImportStatus(
      operator.scheduled,
      warnings.length,
    );
    const observedAt = trigger.observedAt ?? new Date().toISOString();
    const { error: updateError } = await supabase
      .from("import_batches")
      .update({
        status: finalStatus,
        row_count: insertRows.length,
        warning_count: warnings.length,
        warnings,
        source_updated_at: observedAt,
      })
      .eq("id", batch.id);
    if (updateError) throw updateError;

    // The validated snapshot is durable. Do not let a later release failure
    // rewrite it to `failed`: Apps Script will retry, and the unchanged path
    // above retries publication idempotently for this exact batch.
    batchId = null;
    const automaticRelease = await autoPublishValidatedBatch(
      supabase,
      batch.id,
    );

    await supabase.from("audit_logs").insert({
      actor_id: operator.userId,
      action: "sheet.import",
      entity_type: "import_batch",
      entity_id: batch.id,
      after_data: {
        periodId,
        sequence,
        rowCount: insertRows.length,
        warningCount: warnings.length,
        qlcnCandidateCount: qlcn.candidates.length,
        qlcnAwardCount: qlcnAwardResults.length,
        teamCandidateCount: team.candidates.length,
        teamAwardCount: teamAwardResults.length,
        leaderCandidateCount: leader.candidates.length,
        leaderAwardCount: leaderAwardResults.length,
        sourceHash,
        trigger,
        automaticRelease: true,
        releaseId: automaticRelease.releaseId,
        releaseVersion: automaticRelease.releaseVersion,
        reconciliation: {
          managerMetricTotalVnd,
          bestTeamMetricTotalVnd,
          differenceVnd,
        },
      },
    });

    return jsonResponse({
      unchanged: false,
      batch: {
        ...batch,
        status: finalStatus,
        rowCount: insertRows.length,
        warningCount: warnings.length,
      },
      sourceHash,
      reconciliation: {
        managerMetricTotalVnd,
        bestTeamMetricTotalVnd,
        differenceVnd,
      },
      qlcn: {
        candidateCount: qlcn.candidates.length,
        awardCount: qlcnAwardResults.length,
        awards: qlcn.awards.map((award) => ({
          boardCode: award.tierCode,
          rank: award.rank,
          entityCode: award.entityCode,
          displayName: award.displayName,
          regionCodes: award.regionCodes,
          revenueVnd: award.revenueVnd,
          displayRevenue: award.displayRevenue,
          boardSource: award.boardSource,
          needsReview: award.needsReview,
        })),
      },
      team: {
        candidateCount: team.candidates.length,
        awardCount: teamAwardResults.length,
        awards: team.awards.map((award) => ({
          boardCode: "TEAM_RANKING",
          rank: award.rank,
          entityCode: award.entityCode,
          displayName: award.displayName,
          leaderCode: award.leaderCode,
          leaderName: award.leaderName,
          regionCode: award.regionCode,
          revenueVnd: award.revenueVnd,
          displayRevenue: award.displayRevenue,
          needsReview: award.needsReview,
        })),
      },
      leader: {
        candidateCount: leader.candidates.length,
        awardCount: leaderAwardResults.length,
        awards: leader.awards.map((award) => ({
          boardCode: award.tierCode,
          rank: award.rank,
          entityCode: award.employeeCode,
          displayName: award.displayName,
          branchCodes: award.branchCodes,
          teamCodes: award.teamCodes,
          revenueVnd: award.revenueVnd,
          displayRevenue: award.displayRevenue,
          boardSource: award.boardSource,
          needsReview: award.needsReview,
        })),
      },
      warnings,
      automaticRelease,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (batchId) {
      try {
        await serviceClient().from("import_batches").update({
          status: "failed",
          warnings: [{ message }],
        }).eq("id", batchId);
      } catch {
        // Preserve the original error.
      }
    }
    if (message === "UNAUTHORIZED") {
      return jsonResponse({ error: message }, 401);
    }
    if (message === "FORBIDDEN") return jsonResponse({ error: message }, 403);
    return jsonResponse({ error: "SYNC_FAILED", message }, 500);
  }
});
