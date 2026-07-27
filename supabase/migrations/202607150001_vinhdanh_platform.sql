-- UNITE VINH DANH - central admin, Sheet imports, releases and TV devices.
-- Standalone and safe to apply beside another app in the same Supabase project.

create extension if not exists "pgcrypto";

-- Keep Vinh Danh authorization isolated from profiles owned by OneDrop/poster apps.
create table if not exists public.vinhdanh_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vinhdanh_profiles
  drop constraint if exists vinhdanh_profiles_role_check;
alter table public.vinhdanh_profiles
  add constraint vinhdanh_profiles_role_check
  check (role in (
    'super_admin', 'admin', 'accounting', 'content_editor',
    'publisher', 'branch_manager', 'viewer', 'leader'
  ));

create or replace function public.can_view_vinhdanh()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vinhdanh_profiles
    where id = auth.uid()
      and role in (
        'super_admin', 'admin', 'accounting', 'content_editor',
        'publisher', 'branch_manager', 'viewer', 'leader'
      )
  );
$$;

create or replace function public.can_manage_vinhdanh()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vinhdanh_profiles
    where id = auth.uid()
      and role in ('super_admin', 'admin', 'accounting', 'content_editor', 'publisher')
  );
$$;

create or replace function public.can_publish_vinhdanh()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vinhdanh_profiles
    where id = auth.uid()
      and role in ('super_admin', 'admin', 'publisher')
  );
$$;

create or replace function public.vinhdanh_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  role_code text,
  employment_type text check (employment_type in ('full_time', 'part_time', 'other')),
  branch_id uuid references public.branches(id) on delete set null,
  team_code text,
  photo_path text,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sheet_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spreadsheet_id text not null unique,
  auth_mode text not null default 'public' check (auth_mode in ('public', 'service_account')),
  period_cell text,
  final_cell text,
  final_value text not null default 'FINAL',
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sheet_mappings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sheet_sources(id) on delete cascade,
  code text not null,
  entity_type text not null check (entity_type in ('branch_manager', 'leader', 'sale', 'team', 'other')),
  sheet_name text not null,
  range_a1 text,
  title_row integer not null default 1,
  header_row integer not null default 2,
  data_start_row integer not null default 3,
  stop_labels text[] not null default array['TỔNG'],
  column_map jsonb not null default '{}'::jsonb,
  filter_config jsonb not null default '{}'::jsonb,
  board_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, code)
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sheet_sources(id) on delete restrict,
  period_id text not null,
  sequence integer not null default 1,
  status text not null default 'imported'
    check (status in ('importing', 'imported', 'needs_review', 'validated', 'failed', 'archived')),
  source_hash text not null,
  source_updated_at timestamptz,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0,
  warning_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  raw_snapshot jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (source_id, period_id, sequence)
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  mapping_id uuid not null references public.sheet_mappings(id) on delete restrict,
  source_row_key text not null,
  source_row_number integer not null,
  entity_type text not null,
  entity_code text,
  display_name text,
  branch_code text,
  team_code text,
  role_code text,
  source_rank integer,
  source_board_code text,
  revenue_vnd numeric(18,0),
  display_revenue text,
  metrics jsonb not null default '{}'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  row_hash text not null,
  validation_status text not null default 'ok' check (validation_status in ('ok', 'warning', 'error')),
  validation_messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, mapping_id, source_row_key)
);

create index if not exists idx_import_rows_batch on public.import_rows(batch_id);
create index if not exists idx_import_rows_entity on public.import_rows(entity_code);
create index if not exists idx_import_batches_period on public.import_batches(period_id, imported_at desc);

create table if not exists public.award_boards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  audience_type text not null,
  tier_order integer not null default 1,
  rank_limit integer,
  layout_key text not null default 'top3-list',
  theme jsonb not null default '{}'::jsonb,
  rule_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.award_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  board_id uuid not null references public.award_boards(id) on delete restrict,
  import_row_id uuid references public.import_rows(id) on delete set null,
  entity_type text not null,
  entity_code text,
  rank integer not null,
  display_name text not null,
  branch_id uuid references public.branches(id) on delete set null,
  branch_code text,
  team_code text,
  role_label text,
  revenue_vnd numeric(18,0),
  display_revenue text,
  photo_path text,
  needs_review boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, board_id, rank)
);

create unique index if not exists uq_award_results_batch_manager
  on public.award_results(batch_id, entity_code)
  where entity_type = 'branch_manager' and entity_code is not null;

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null
    check (content_type in ('recognition', 'image', 'video', 'announcement', 'event', 'task', 'emergency')),
  title text not null,
  body text,
  media_path text,
  thumbnail_path text,
  duration_seconds integer not null default 15 check (duration_seconds > 0),
  audio_enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null default 'all' check (scope in ('all', 'branch', 'screen')),
  branch_id uuid references public.branches(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  board_id uuid references public.award_boards(id) on delete cascade,
  position integer not null,
  duration_seconds integer,
  config jsonb not null default '{}'::jsonb,
  unique (playlist_id, position),
  check (content_item_id is not null or board_id is not null)
);

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  release_version text not null unique,
  period_id text,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  playlist_id uuid references public.playlists(id) on delete set null,
  parent_release_id uuid references public.releases(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'preparing', 'ready', 'published', 'superseded', 'rolled_back', 'failed')),
  activate_at timestamptz,
  manifest jsonb not null default '{}'::jsonb,
  target_config jsonb not null default '{"scope":"all"}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.guard_published_release()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' and (
    new.release_version is distinct from old.release_version or
    new.period_id is distinct from old.period_id or
    new.import_batch_id is distinct from old.import_batch_id or
    new.playlist_id is distinct from old.playlist_id or
    new.manifest is distinct from old.manifest or
    new.target_config is distinct from old.target_config
  ) then
    raise exception 'Published releases are immutable; create a new release version.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_releases_immutable on public.releases;
create trigger trg_releases_immutable
before update on public.releases
for each row execute function public.guard_published_release();

create table if not exists public.manual_overrides (
  id uuid primary key default gen_random_uuid(),
  period_id text not null,
  import_batch_id uuid references public.import_batches(id) on delete cascade,
  award_result_id uuid references public.award_results(id) on delete cascade,
  release_id uuid references public.releases(id) on delete cascade,
  field_path text not null,
  source_value jsonb,
  override_value jsonb,
  reason text,
  scope text not null default 'release' check (scope in ('release', 'period')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.screens (
  id uuid primary key default gen_random_uuid(),
  screen_code text not null unique,
  name text not null,
  branch_id uuid references public.branches(id) on delete set null,
  device_type text not null default 'android_tv' check (device_type in ('android_tv', 'web', 'signage_box')),
  orientation text not null default 'landscape' check (orientation in ('landscape', 'portrait')),
  resolution text not null default '1920x1080',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  device_token_hash text not null unique,
  pairing_code text not null unique,
  device_name text,
  device_type text not null default 'android_tv',
  app_version text,
  screen_id uuid references public.screens(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked', 'expired')),
  expires_at timestamptz not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.screen_state (
  screen_id uuid primary key references public.screens(id) on delete cascade,
  desired_release_id uuid references public.releases(id) on delete set null,
  ready_release_id uuid references public.releases(id) on delete set null,
  current_release_id uuid references public.releases(id) on delete set null,
  current_item_key text,
  connection_state text not null default 'offline' check (connection_state in ('online', 'offline', 'error')),
  last_seen_at timestamptz,
  last_error text,
  app_version text,
  cache_state jsonb not null default '{}'::jsonb,
  device_info jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.release_targets (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  screen_id uuid not null references public.screens(id) on delete cascade,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'downloading', 'ready', 'active', 'failed', 'offline')),
  last_error text,
  ready_at timestamptz,
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (release_id, screen_id)
);

create table if not exists public.audit_logs (
  id bigint generated by default as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Updated-at triggers.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'vinhdanh_profiles','branches','employees','sheet_sources','sheet_mappings','award_boards',
    'award_results','content_items','playlists','releases','screens',
    'device_registrations','screen_state','release_targets'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.vinhdanh_set_updated_at()',
      'trg_' || table_name || '_updated_at', table_name
    );
  end loop;
end $$;

-- RLS: TV devices never query these tables directly; screen-api returns scoped manifests.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'vinhdanh_profiles','branches','employees','sheet_sources','sheet_mappings','import_batches','import_rows',
    'award_boards','award_results','content_items','playlists','playlist_items','releases',
    'manual_overrides','screens','device_registrations','screen_state','release_targets','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Staff may read only their own Vinh Danh role. Role grants remain SQL/service-role only.
drop policy if exists vinhdanh_profiles_self_read on public.vinhdanh_profiles;
create policy vinhdanh_profiles_self_read on public.vinhdanh_profiles
for select to authenticated
using (id = auth.uid());

-- Read policies for signed-in staff.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'branches','employees','sheet_sources','sheet_mappings','import_batches','import_rows',
    'award_boards','award_results','content_items','playlists','playlist_items','releases',
    'manual_overrides','screens','screen_state','release_targets','audit_logs'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_staff_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_view_vinhdanh())',
      table_name || '_staff_read', table_name
    );
  end loop;
end $$;

-- Manage policies. Service-role Edge Functions bypass RLS for device-only tables.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'branches','employees','sheet_sources','sheet_mappings','import_batches','import_rows',
    'award_boards','award_results','content_items','playlists','playlist_items','manual_overrides',
    'screens','screen_state','release_targets'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_staff_manage', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.can_manage_vinhdanh()) with check (public.can_manage_vinhdanh())',
      table_name || '_staff_manage', table_name
    );
  end loop;
end $$;

drop policy if exists releases_publish_manage on public.releases;
create policy releases_publish_manage on public.releases
for all to authenticated
using (public.can_publish_vinhdanh())
with check (public.can_publish_vinhdanh());

drop policy if exists audit_logs_staff_insert on public.audit_logs;
create policy audit_logs_staff_insert on public.audit_logs
for insert to authenticated
with check (actor_id = auth.uid() and public.can_view_vinhdanh());

-- Private media buckets. TV players receive short-lived signed URLs from screen-api.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'vinhdanh-media', 'vinhdanh-media', false, 524288000,
    array['image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4']::text[]
  ),
  (
    'employee-photos', 'employee-photos', false, 20971520,
    array['image/png','image/jpeg','image/webp']::text[]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vinhdanh_storage_staff_read on storage.objects;
create policy vinhdanh_storage_staff_read on storage.objects
for select to authenticated
using (bucket_id in ('vinhdanh-media','employee-photos') and public.can_view_vinhdanh());

drop policy if exists vinhdanh_storage_staff_manage on storage.objects;
create policy vinhdanh_storage_staff_manage on storage.objects
for all to authenticated
using (bucket_id in ('vinhdanh-media','employee-photos') and public.can_manage_vinhdanh())
with check (bucket_id in ('vinhdanh-media','employee-photos') and public.can_manage_vinhdanh());

-- Known pilot/branch details supplied by the operator.
insert into public.branches (code, name, address)
values
  ('TBT125', 'Pilot 125 TBT', '125 Trần Bình Trọng'),
  ('AC683', 'Chi nhánh Âu Cơ', '683 Âu Cơ, Tân Phú')
on conflict (code) do update set name = excluded.name, address = excluded.address;

insert into public.screens (screen_code, name, branch_id, device_type, orientation, resolution)
select 'TBT125-TV01', 'TV chính - 125 Trần Bình Trọng', id, 'android_tv', 'landscape', '1920x1080'
from public.branches where code = 'TBT125'
on conflict (screen_code) do update set
  name = excluded.name,
  branch_id = excluded.branch_id,
  is_active = true;

insert into public.screens (screen_code, name, branch_id, device_type, orientation, resolution)
select 'AC683-TV01', 'TV chính - 683 Âu Cơ Tân Phú', id, 'android_tv', 'landscape', '1920x1080'
from public.branches where code = 'AC683'
on conflict (screen_code) do update set
  name = excluded.name,
  branch_id = excluded.branch_id,
  is_active = true;

insert into public.screen_state (screen_id)
select id from public.screens where screen_code in ('TBT125-TV01', 'AC683-TV01')
on conflict (screen_id) do nothing;

insert into public.award_boards (code, name, audience_type, tier_order, rank_limit, layout_key, rule_config)
values
  ('QLCN_THU_LINH', 'Thủ Lĩnh', 'branch_manager', 1, 3, 'podium-3', '{"min":0,"maxExclusive":300000000,"sourceMode":"derived","metric":"DS_TEAM.best_team_metric","groupBy":"DS_KV.manager_employee_code","mergeRegions":true,"derivationVersion":"qlcn-best-team-by-region-v3"}'),
  ('QLCN_DAI_TUONG', 'Đại Tướng', 'branch_manager', 2, 3, 'podium-3', '{"min":300000000,"maxExclusive":500000000,"sourceMode":"derived","metric":"DS_TEAM.best_team_metric","groupBy":"DS_KV.manager_employee_code","mergeRegions":true,"derivationVersion":"qlcn-best-team-by-region-v3"}'),
  ('QLCN_THONG_SOAI', 'Thống Soái', 'branch_manager', 3, 3, 'podium-3', '{"min":500000000,"sourceMode":"derived","metric":"DS_TEAM.best_team_metric","groupBy":"DS_KV.manager_employee_code","mergeRegions":true,"derivationVersion":"qlcn-best-team-by-region-v3"}'),
  ('LEADER_SU_TU', 'Sư Tử', 'leader', 1, 10, 'top3-list', '{"min":50000000,"maxExclusive":100000000,"sourceMode":"prefer_sheet"}'),
  ('LEADER_PHUONG_HOANG', 'Phượng Hoàng', 'leader', 2, 10, 'top3-list', '{"min":100000000,"maxExclusive":200000000,"sourceMode":"prefer_sheet"}'),
  ('LEADER_KY_LAN', 'Kỳ Lân', 'leader', 3, 10, 'top3-list', '{"min":200000000,"sourceMode":"prefer_sheet"}'),
  ('SALE_FULL_TIME', 'Sale Full-time', 'sale_full_time', 1, 10, 'top3-list', '{"sourceMode":"sheet"}'),
  ('SALE_PART_TIME', 'Sale Part-time', 'sale_part_time', 1, 10, 'top3-list', '{"sourceMode":"sheet"}'),
  ('TEAM_RANKING', 'Vinh danh Team', 'team', 1, 10, 'top3-list', '{"sourceMode":"derived","metric":"DS_TEAM.best_team_metric","identity":["branch_code","team_code"],"requireRegion":true,"positiveOnly":true,"derivationVersion":"team-best-team-ranking-v1"}')
on conflict (code) do update set
  name = excluded.name,
  audience_type = excluded.audience_type,
  tier_order = excluded.tier_order,
  rank_limit = excluded.rank_limit,
  layout_key = excluded.layout_key,
  rule_config = excluded.rule_config;

insert into public.sheet_sources (name, spreadsheet_id, auth_mode, config)
values (
  'Doanh số Unite Group',
  '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM',
  'public',
  '{"timezone":"Asia/Ho_Chi_Minh","finalMode":"manual_or_cell","currencySuffix":" VNĐ","groupSeparator":".","unresolvedCategories":["LEADER","SALE_FT","SALE_PT"]}'
)
on conflict (spreadsheet_id) do update set name = excluded.name, config = excluded.config;

insert into public.sheet_mappings (
  source_id, code, entity_type, sheet_name, range_a1, title_row, header_row, data_start_row,
  column_map, filter_config
)
select id, 'DS_KV', 'branch_manager', 'DS-KV', 'B1:M20', 1, 2, 3,
  '{
    "source_rank":{"exact":"STT"},
    "branch_code":{"exact":"KHU VỰC"},
    "display_name":{"exact":"QLCN"},
    "entity_code":{"exact":"MNV"},
    "role_code":{"exact":"CẤP BẬC"}
  }'::jsonb,
  '{"numericRankOnly":true,"skipBlankName":true,"managerRevenueMode":"sum_team_best_metric","teamMetricField":"best_team_metric","groupManagerBy":"entity_code"}'::jsonb
from public.sheet_sources where spreadsheet_id = '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM'
on conflict (source_id, code) do update set
  sheet_name = excluded.sheet_name,
  range_a1 = excluded.range_a1,
  column_map = excluded.column_map,
  filter_config = excluded.filter_config;

insert into public.sheet_mappings (
  source_id, code, entity_type, sheet_name, range_a1, title_row, header_row, data_start_row,
  column_map, filter_config
)
select id, 'DS_TEAM', 'team', 'DS-TEAM', 'B1:R1000', 1, 2, 3,
  '{
    "source_rank":{"exact":"STT"},
    "team_code":{"exact":"TEAM"},
    "display_name":{"exact":"LEADER"},
    "entity_code":{"exact":"MNV"},
    "role_code":{"exact":"CẤP BẬC"},
    "branch_code":{"exact":"KHU VỰC"},
    "cluster_code":{"exact":"CỤM"},
    "total_deposit":{"regex":"^TỔNG CỌC T[0-9]+$"},
    "total_gdtc_hc":{"regex":"^TỔNG GDTC\\+HC T[0-9]+$"},
    "best_team_metric":{"exact":"GDTC XÉT BEST TEAM"},
    "leader_metric_candidate":{"exact":"GDTC TÍNH TN"}
  }'::jsonb,
  '{"numericRankOnly":true,"skipBlankName":false,"selectedRevenueField":"best_team_metric"}'::jsonb
from public.sheet_sources where spreadsheet_id = '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM'
on conflict (source_id, code) do update set
  sheet_name = excluded.sheet_name,
  range_a1 = excluded.range_a1,
  column_map = excluded.column_map,
  filter_config = excluded.filter_config;
