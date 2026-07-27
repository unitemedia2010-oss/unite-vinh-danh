export type PublishTargetScope = "all" | "screenIds" | "branchIds";

type PublishTargetScopeInput = {
  requestedScope: unknown;
  hasScreenIds: boolean;
  hasBranchIds: boolean;
  screenCount: number;
  branchCount: number;
};

export type PublishTargetScopeResult =
  | { scope: PublishTargetScope; error?: never }
  | { scope?: never; error: "INVALID_TARGET_SCOPE" | "TARGET_SCOPE_MISMATCH" | "NO_TARGET_SCREENS" };

export function resolvePublishTargetScope(input: PublishTargetScopeInput): PublishTargetScopeResult {
  if (input.hasScreenIds && input.hasBranchIds) return { error: "TARGET_SCOPE_MISMATCH" };

  const inferredScope: PublishTargetScope = input.hasScreenIds
    ? "screenIds"
    : input.hasBranchIds
    ? "branchIds"
    : "all";
  const scope = input.requestedScope === undefined ? inferredScope : input.requestedScope;
  if (scope !== "all" && scope !== "screenIds" && scope !== "branchIds") {
    return { error: "INVALID_TARGET_SCOPE" };
  }
  if (
    (scope === "all" && (input.hasScreenIds || input.hasBranchIds)) ||
    (scope === "screenIds" && (!input.hasScreenIds || input.hasBranchIds)) ||
    (scope === "branchIds" && (!input.hasBranchIds || input.hasScreenIds))
  ) {
    return { error: "TARGET_SCOPE_MISMATCH" };
  }
  if (
    (scope === "screenIds" && input.screenCount === 0) ||
    (scope === "branchIds" && input.branchCount === 0)
  ) {
    return { error: "NO_TARGET_SCREENS" };
  }
  return { scope };
}

type ReleaseReportInput = {
  currentReleaseId: string | null;
  readyReleaseId: string | null;
  desiredReleaseId: string | null;
  existingCurrentReleaseId: string | null;
  releaseStates: Record<string, {
    status: string | undefined;
    activateAt: string | null | undefined;
  } | undefined>;
  targetedReleaseIds: Iterable<string>;
  serverTimeMs: number;
};

export function findRejectedReportedReleaseId(input: ReleaseReportInput): string | null {
  const targetedIds = new Set(input.targetedReleaseIds);
  const reportedIds = [...new Set(
    [input.currentReleaseId, input.readyReleaseId].filter((value): value is string => Boolean(value)),
  )];
  return reportedIds.find((releaseId) => {
    if (!targetedIds.has(releaseId)) return true;
    const release = input.releaseStates[releaseId];
    const status = release?.status;
    if (releaseId === input.readyReleaseId) {
      if (releaseId !== input.desiredReleaseId || status !== "published") return true;
    }
    if (releaseId === input.currentReleaseId) {
      const activateAtMs = release?.activateAt == null ? null : Date.parse(release.activateAt);
      const activationIsDue = activateAtMs === null ||
        (Number.isFinite(activateAtMs) && activateAtMs <= input.serverTimeMs);

      const isExistingCurrent =
        releaseId === input.existingCurrentReleaseId &&
        (status === "published" || status === "superseded");
      const isDueDesired =
        releaseId === input.desiredReleaseId &&
        status === "published" &&
        activationIsDue;
      if (!isExistingCurrent && !isDueDesired) return true;
    }
    return false;
  }) ?? null;
}
