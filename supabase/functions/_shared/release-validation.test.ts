import {
  findRejectedReportedReleaseId,
  resolvePublishTargetScope,
} from "./release-validation.ts";

function assertEquals<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test("omitted target lists mean all active screens", () => {
  assertEquals(
    resolvePublishTargetScope({
      requestedScope: undefined,
      hasScreenIds: false,
      hasBranchIds: false,
      screenCount: 0,
      branchCount: 0,
    }),
    { scope: "all" },
  );
});

Deno.test("an explicitly empty target list never falls back to all screens", () => {
  assertEquals(
    resolvePublishTargetScope({
      requestedScope: undefined,
      hasScreenIds: true,
      hasBranchIds: false,
      screenCount: 0,
      branchCount: 0,
    }),
    { error: "NO_TARGET_SCREENS" },
  );
});

Deno.test("screen and branch target lists cannot be combined", () => {
  assertEquals(
    resolvePublishTargetScope({
      requestedScope: undefined,
      hasScreenIds: true,
      hasBranchIds: true,
      screenCount: 1,
      branchCount: 1,
    }),
    { error: "TARGET_SCOPE_MISMATCH" },
  );
});

Deno.test("a superseded current release remains a valid heartbeat report", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "r1",
      readyReleaseId: "r2",
      desiredReleaseId: "r2",
      existingCurrentReleaseId: "r1",
      releaseStates: {
        r1: { status: "superseded", activateAt: "2026-07-25T12:00:00.000Z" },
        r2: { status: "published", activateAt: "2026-07-25T14:00:00.000Z" },
      },
      targetedReleaseIds: ["r1", "r2"],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    null,
  );
});

Deno.test("an existing superseded current remains valid even with a future legacy activation time", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "r1",
      readyReleaseId: "r2",
      desiredReleaseId: "r2",
      existingCurrentReleaseId: "r1",
      releaseStates: {
        r1: { status: "superseded", activateAt: "2026-07-25T15:00:00.000Z" },
        r2: { status: "published", activateAt: "2026-07-25T14:00:00.000Z" },
      },
      targetedReleaseIds: ["r1", "r2"],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    null,
  );
});

Deno.test("a ready release must still be published", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "r1",
      readyReleaseId: "r2",
      desiredReleaseId: "r2",
      existingCurrentReleaseId: "r1",
      releaseStates: {
        r1: { status: "published", activateAt: "2026-07-25T12:00:00.000Z" },
        r2: { status: "superseded", activateAt: "2026-07-25T12:30:00.000Z" },
      },
      targetedReleaseIds: ["r1", "r2"],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    "r2",
  );
});

Deno.test("a published but untargeted release is rejected", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "r1",
      readyReleaseId: null,
      desiredReleaseId: "r1",
      existingCurrentReleaseId: null,
      releaseStates: {
        r1: { status: "published", activateAt: "2026-07-25T12:00:00.000Z" },
      },
      targetedReleaseIds: [],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    "r1",
  );
});

Deno.test("a future published release may be ready but cannot be current", () => {
  const releaseStates = {
    r2: { status: "published", activateAt: "2026-07-25T14:00:00.000Z" },
  };
  const serverTimeMs = Date.parse("2026-07-25T13:00:00.000Z");

  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: null,
      readyReleaseId: "r2",
      desiredReleaseId: "r2",
      existingCurrentReleaseId: null,
      releaseStates,
      targetedReleaseIds: ["r2"],
      serverTimeMs,
    }),
    null,
  );
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "r2",
      readyReleaseId: null,
      desiredReleaseId: "r2",
      existingCurrentReleaseId: null,
      releaseStates,
      targetedReleaseIds: ["r2"],
      serverTimeMs,
    }),
    "r2",
  );
});

Deno.test("a current release with an invalid activation timestamp is rejected", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "r1",
      readyReleaseId: null,
      desiredReleaseId: "r1",
      existingCurrentReleaseId: null,
      releaseStates: { r1: { status: "published", activateAt: "not-a-date" } },
      targetedReleaseIds: ["r1"],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    "r1",
  );
});

Deno.test("a null activation timestamp means the desired release is immediately eligible", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "r1",
      readyReleaseId: null,
      desiredReleaseId: "r1",
      existingCurrentReleaseId: null,
      releaseStates: { r1: { status: "published", activateAt: null } },
      targetedReleaseIds: ["r1"],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    null,
  );
});

Deno.test("an arbitrary old targeted release cannot replace screen state", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: "old",
      readyReleaseId: null,
      desiredReleaseId: "r2",
      existingCurrentReleaseId: "r1",
      releaseStates: {
        old: { status: "published", activateAt: "2026-07-25T10:00:00.000Z" },
      },
      targetedReleaseIds: ["old"],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    "old",
  );
});

Deno.test("ready release must be the screen desired release", () => {
  assertEquals(
    findRejectedReportedReleaseId({
      currentReleaseId: null,
      readyReleaseId: "old",
      desiredReleaseId: "r2",
      existingCurrentReleaseId: "r1",
      releaseStates: {
        old: { status: "published", activateAt: "2026-07-25T10:00:00.000Z" },
      },
      targetedReleaseIds: ["old"],
      serverTimeMs: Date.parse("2026-07-25T13:00:00.000Z"),
    }),
    "old",
  );
});
