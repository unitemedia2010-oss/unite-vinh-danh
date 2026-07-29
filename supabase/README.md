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

The accounting-owned rules are locked to these columns:

Column position is authoritative; the visible header is only used to detect
the `Tn` month and to produce a diagnostic warning. Accounting does not have to
rename a tab or manually correct a header every month. Keep the stable tab
names `DS-KV` and `DS-TEAM`; when the workbook rolls from `T8` to `T9`, the
parser keeps reading the same positions and changes the release period from
`YYYY-08` to `YYYY-09` automatically.

- QLCN uses `DS-KV` column L, `TỔNG GDTC+HC Tn`, and column N, `Bảng Đấu`.
  Every valid region row is ranked independently inside its manually assigned
  Thống Soái, Tướng Quân or Thủ Lĩnh board. The same manager `MNV` may therefore
  appear more than once when they manage multiple ranked regions.
- Leader uses `DS-TEAM` column O, `GDTC XÉT BEST TEAM`, and column S,
  `BẢNG ĐẤU`. Revenue is summed by Leader `MNV` across distinct teams, then
  ranked within the manually assigned Kỳ Lân, Phượng Hoàng or Sư Tử board.
- Top Team ranks valid (`KHU VỰC`, `TEAM`) identities directly by `DS-TEAM`
  column O. Ranks 1–3 are featured and ranks 4–10 use the list layout.

No calculation falls back to `TỔNG CỌC`, `GDTC TÍNH TN` or another convenient
column. A required source column that cannot be resolved, conflicting detected
periods or a caller-supplied period mismatch blocks the whole sync. Ambiguous
identity and invalid `Bảng Đấu` values exclude only their own row instead of
guessing or blocking valid neighbours.

Rows without a positive number, complete identity or valid `Bảng Đấu` value are
excluded individually. For example, two valid Nguyễn Thị Hà (`U177`) rows for
DOC1 and DFC remain two independent candidates and may occupy two ranks. Blank
Leader `BẢNG ĐẤU` values and unresolved Sale FT/PT sources remain visible as
advisory warnings without fabricating names or revenue.

Publishing is gated by a validated import batch. Row-level errors are excluded
from `award_results`; schema/period errors fail before publication. A completed
batch is validated and published automatically, while the transactional release
RPC keeps the last good release live on any release/database failure.

`screen-api` returns only releases whose database status is `published`. It may return a published
release before its `activate_at` timestamp so a TV can pre-download media; the TV keeps its current
release playing and activates the cached release at `activate_at`.

To audit the QLCN and Top Team calculations against the current public workbook without
writing to the database:

```powershell
npx -y deno-bin run --allow-net --allow-import supabase/scripts/check-live-qlcn.ts
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
