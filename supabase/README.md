# Supabase backend - Unite Vinh Danh

This directory contains the production-oriented schema and three Edge Functions:

- `sync-sheet`: imports versioned snapshots from the accounting Sheet.
- `screen-api`: registers/approves/revokes TV devices, returns scoped manifests and records heartbeats.
- `publish-release`: assigns an immutable release to target screens and broadcasts a lightweight update event.

## Safe rollout order

1. Apply `migrations/202607150001_vinhdanh_platform.sql`. It is standalone and uses
   `vinhdanh_profiles`, so it can coexist with OneDrop or the legacy poster app.
2. Do not apply the root legacy `01_schema.sql` merely to install Vinh Danh.
3. Apply `migrations/202607150002_best_team_qlcn_rules.sql` so an existing project also
   receives the confirmed Best Team/QLCN rules and the expanded `DS-TEAM` range.
4. Apply `migrations/202607250003_seed_nine_branches.sql`, then
   `migrations/202607250004_transactional_release_publish.sql`. The fourth migration installs the
   service-role-only `publish_vinhdanh_release` RPC; it publishes the release, writes its exact active
   TV targets and advances `screen_state` in one database transaction.
5. Copy `functions/.env.example` to the local Supabase environment and fill secrets outside source control.
6. Deploy the three Edge Functions.
7. Configure the Admin app with the project URL and publishable key.

Bootstrap the first operator by inserting their existing `auth.users.id` into
`public.vinhdanh_profiles` with role `super_admin`. Never grant roles through a public client.

`screen-api` uses one endpoint with actions `register`, `status`, `manifest`,
`public_manifest`, `heartbeat`, `registrations`, `approve` and `revoke`. Device calls
authenticate with the opaque token returned by `register`; Admin actions authenticate with
the signed-in user JWT. `public_manifest` is deliberately read-only and returns only the
latest company-wide release that is published, activated and linked to a validated import.
It exposes signed display media, removes internal Storage paths/import diagnostics, supports
ETag/cache headers and has a best-effort per-isolate request limit.

Do not put `SUPABASE_SERVICE_ROLE_KEY` or `SYNC_SHARED_SECRET` in the Admin/web/Android client.

## Current Sheet mapping

The shared workbook currently contains `DS-KV` and `DS-TEAM`. The source date in
the title is an observation date; the recognition period comes from the required
`Tn` metric headers. For example, the live title dated `27/07/2026` with `T8`
headers resolves to period `2026-08`, not July.

As of 2026-09-29, `sync-sheet` automatically resolves the unique **TỔNG CỌC Tn**
header in both DS-KV and DS-TEAM. Runtime policy supersedes legacy fixed-column
SQL settings; the Admin imports page no longer offers a positional selector.

- Read A1:AZ1000, including column A for the DS-KV title/STT. Request two header
  rows from Google Visualization (zero causes numeric inference to erase labels).
  Recover the collapsed title/STT and preserve original source row numbers.
- Match the full total-deposit header, ignoring accents, case and whitespace;
  accept T1 through T12 (also T01). Never use CỌC Tn, CỌC RVTn or GDTC as fallback.
- Require unique identity and BẢNG ĐẤU headers. Missing/duplicate columns, missing
  year, period conflicts and invalid amounts/formulas block before creating a batch.
  Multiple total-deposit months in one tab are ambiguous and must be resolved in
  the source; no implicit choice based on today's date.
- Skip a leading total. Stop at a trailing total, including Visualization's
  numeric subtotal whose STT label was erased. Do not ingest the secondary table.
- QLCN ranks each DS-KV region row independently. Leader sums DS-TEAM total deposits
  per MNV across distinct teams; Top Team uses (KHU VỰC, TEAM). BẢNG ĐẤU remains
  operator-maintained. These grouping and eligibility rules are unchanged.
- Persist detected column, header, period and algorithm version in raw_snapshot
  and batch metadata.rankingSources; show the batch detection in Admin.

See [implementation/rollout plan](AUTO-DEPOSIT-PLAN.md). Deploy sync-sheet before
web, then update the bound Apps Script and its WATCH_RANGES_JSON if configured.
Legacy ranking-column RPCs are retained for old clients but no longer select
metrics in this sync implementation. No schema migration or Sheet edit is needed.

Read-only live verification (prints aggregate diagnostics, no personnel records):

```powershell
node --experimental-strip-types supabase/scripts/audit-auto-deposit.mjs SPREADSHEET_ID
node --experimental-strip-types --test supabase/functions/_shared/auto-deposit.test.mjs
```

Rows without a positive number, complete identity or valid `Bảng Đấu` value are
excluded individually. For example, two valid Nguyễn Thị Hà (`U177`) rows for
DOC1 and DFC remain two independent candidates and may occupy two ranks. Blank
Leader `BẢNG ĐẤU` values and unresolved Sale FT/PT sources remain visible as
advisory warnings without fabricating names or revenue.

Publishing is gated by a validated import batch. Row-level errors are excluded
from `award_results`; schema/period errors fail before publication. A completed
batch is validated and published automatically, while the transactional release
RPC keeps the last good release live on any release/database failure.

Emergency presentation exclusions are stored in
`recognition_visibility_rules`, scoped by `period_id`. The guarded
`set_vinhdanh_visibility_rule` RPC accepts only Admin/Super Admin calls, requires
a reason when hiding, and writes `audit_logs`. Person rules use the normalized
MNV so the same person is hidden from every appearance in that period; board
rules use the stable `award_boards.code`. Source Sheet rows and `award_results`
remain unchanged. A release insert applies the active rules atomically, and
`screen-api` removes internal hidden templates before returning either paired-TV
or public-share manifests. A rule change therefore requires a new READY release;
the currently published release remains untouched until explicit publication.
Each READY manifest also stores a visibility revision. If a rule changes between
READY creation and Publish, the database rejects the stale release and requires
Admin to create a new READY candidate.

`screen-api` returns only releases whose database status is `published`. It may return a published
release before its `activate_at` timestamp so a TV can pre-download media; the TV keeps its current
release playing and activates the cached release at `activate_at`.

To audit the QLCN and Top Team calculations against the current public workbook without
writing to the database:

```powershell
npx -y deno-bin run --allow-net --allow-import supabase/scripts/check-live-qlcn.ts
```

The optional second and third arguments audit a specific Admin selection:

```powershell
# spreadsheet ID, DS-TEAM column, DS-KV column
npx -y deno-bin run --allow-net --allow-import supabase/scripts/check-live-qlcn.ts 1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM M K
```

Recommended accounting output tab:

```text
period | status | category | tier | rank | subject_type | subject_code
subject_name | employee_code | branch_code | team_code | revenue_vnd
photo_key | note | enabled
```

Name that tab `VINH_DANH_OUTPUT` and set `status` to `FINAL` when it is ready. Once available, add one `sheet_mapping` for that tab and the sync function can import results without deriving business rules.

## Scheduled sync

Apps Script is not required for a manual month-end workflow, but it is recommended when
accounting expects daily formula values to appear as a new review snapshot within minutes.
An `onEdit` trigger alone is insufficient because Google does not fire it for formula,
`QUERY` or `IMPORTRANGE` recalculation. The bound template in
`integrations/google-apps-script` combines a debounced edit trigger with a periodic
fingerprint poll.

Automated calls authenticate with `SYNC_SHARED_SECRET`, stored only in Supabase Function
secrets and Apps Script Script Properties. They cannot set `force: true`. The backend
re-reads the Sheet with cache bypass, serializes concurrent imports through
`start_vinhdanh_import_batch`, and deduplicates identical source hashes. Once all blocking
schema/period checks pass, row warnings remain visible but invalid rows are excluded and the
batch is validated automatically. `auto_publish_vinhdanh_import_batch` then clones the
latest company-wide published presentation, replaces every recognition payload with this
batch's `award_results`, and atomically assigns the new immutable release to all active TVs.
If any publication step fails, the transaction rolls back and the previous release remains
desired/public; an identical subsequent sync retries publication for the validated batch.
If a `final_cell` is configured, its value is still enforced.

Apply `migrations/202607280001_atomic_sheet_sync.sql` and
`migrations/202607280002_live_sheet_ranking_rules.sql`, the Sheet mapping/index migration,
and `migrations/202607280004_automatic_sheet_release.sql` before deploying the updated
`sync-sheet`, then follow `integrations/google-apps-script/README.md`. Keep a 5-minute poll
for normal daily operation; use 1 minute only during closing periods after checking Apps
Script quota usage.

Public share clients can read the approved release without a device token:

```text
GET /functions/v1/screen-api?action=public_manifest
```

The response is intentionally empty (`release: null`) until a validated, company-wide
release has actually been published and its activation time has arrived. Clients must not
fall back to demo names when this happens.
