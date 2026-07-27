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

`screen-api` uses one POST endpoint with actions `register`, `status`, `manifest`,
`heartbeat`, `registrations`, `approve` and `revoke`. Device calls authenticate with the
opaque token returned by `register`; Admin actions authenticate with the signed-in user JWT.

Do not put `SUPABASE_SERVICE_ROLE_KEY` or `SYNC_SHARED_SECRET` in the Admin/web/Android client.

## Current Sheet mapping

The shared workbook currently contains only `DS-KV` and `DS-TEAM`. It has no `FINAL`
cell and no pre-ranked award tables. Both automatic calculations use the finalized
`DS-TEAM.GDTC XÉT BEST TEAM` metric:

- Top Team ranks the 10 highest valid (`KHU VỰC`, `TEAM`) identities. A repeated team code
  in another region is a different identity. Rows with a blank region or team are excluded
  with review warnings; ranks 1–3 are featured and ranks 4–10 use the list layout.
- QLCN sums those valid team contributions per region, joins the region to `DS-KV`, then
  merges every region owned by the same manager `MNV` before assigning the tier and Top 3
  rank. Managers are never merged by display name. For example, Nguyễn Thị Hà (`U177`)
  owns DOC1 and DFC, so both regions produce one QLCN result of `298.783.478 VNĐ`.

Neither calculation uses `TỔNG CỌC` nor `TỔNG GDTC+HC`. Missing or ambiguous mappings
are review warnings and are never double-counted. Leader and Sale FT/PT inputs are the only
award categories still unresolved, so the imported batch remains `needs_review` until those
categories are supplied or explicitly excluded by an Admin.

The live workbook audit on 15/07/2026 produced these Top Team leaders:

1. MONEY — Trần Xuân Hoa (`U966`, TBC): `119.530.778 VNĐ`.
2. FUSION — Phạm Vũ Thư (`U382`, DOC1): `94.334.593 VNĐ`.
3. ZENITH — Nguyễn Thị Cẩm Giang (`U553`, CTC): `87.308.667 VNĐ`.

There are 43 valid region/team identities totaling `1.627.124.507 VNĐ`. Five support rows
(PKD, HT, PVH, PNS and PMKT) totaling `82.330.881 VNĐ` have no region and are excluded
from automatic Team ranking and QLCN aggregation with warnings. A further `15.837.500 VNĐ`
from region TP remains unassigned only on the QLCN side because `DS-KV` has no QLCN/MNV
for TP.

Publishing is also gated: a release must be `ready`, and a linked import batch must be
`validated`. This keeps unresolved region/manager rows off the TV even if award result rows
have already been generated for Admin review.

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

Scheduled imports deliberately refuse to run until `sheet_sources.final_cell` is configured. Manual Admin imports can pass `force: true` while the current workbook has no FINAL marker. Store the schedule secret in Supabase Vault before adding a `pg_cron` request to `sync-sheet`.
