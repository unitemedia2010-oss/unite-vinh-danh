-- Global visual settings are public-readable for TV/share clients. Writes go
-- through a guarded RPC so arbitrary clients cannot mutate the live visuals.
create table if not exists public.app_visual_settings (
  id integer primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint app_visual_settings_settings_object_check
    check (jsonb_typeof(settings) = 'object')
);

-- Repair a malformed row left by an older unrestricted draft before adding
-- the object constraint to an already-existing table.
update public.app_visual_settings
set settings = '{
  "watermarkOpacity": 8,
  "watermarkOffsetY": -44,
  "watermarkSize": 92,
  "boardBadges": {}
}'::jsonb,
updated_at = now()
where jsonb_typeof(settings) <> 'object';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_visual_settings'::regclass
      and conname = 'app_visual_settings_settings_object_check'
  ) then
    alter table public.app_visual_settings
      add constraint app_visual_settings_settings_object_check
      check (jsonb_typeof(settings) = 'object');
  end if;
end $$;

alter table public.app_visual_settings enable row level security;

drop policy if exists "Enable read access for all users" on public.app_visual_settings;
drop policy if exists "Enable update for all users" on public.app_visual_settings;
drop policy if exists "Enable insert for all users" on public.app_visual_settings;
drop policy if exists app_visual_settings_public_read on public.app_visual_settings;
drop policy if exists app_visual_settings_admin_insert on public.app_visual_settings;
drop policy if exists app_visual_settings_admin_update on public.app_visual_settings;

create policy app_visual_settings_public_read
on public.app_visual_settings
for select
to anon, authenticated
using (id = 1);

-- PostgREST clients can only read this table. The RPC below is the sole write
-- entry point for authenticated users.
revoke all on table public.app_visual_settings from public, anon, authenticated;
grant select on table public.app_visual_settings to anon, authenticated;

insert into public.app_visual_settings (id, settings)
values (1, '{
  "watermarkOpacity": 8,
  "watermarkOffsetY": -44,
  "watermarkSize": 92,
  "boardBadges": {}
}') on conflict (id) do nothing;

create or replace function public.set_app_visual_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_badges jsonb := '{}'::jsonb;
  v_badge_key text;
  v_badge_value jsonb;
  v_badge_url text;
  v_opacity integer := 8;
  v_offset_y integer := -44;
  v_size integer := 92;
begin
  if v_actor_id is null or not exists (
    select 1
    from public.vinhdanh_profiles
    where id = v_actor_id
      and role in ('super_admin', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_VISUAL_SETTINGS';
  end if;

  if jsonb_typeof(p_settings -> 'watermarkOpacity') = 'number' then
    v_opacity := least(12, greatest(0, round((p_settings ->> 'watermarkOpacity')::numeric)))::integer;
  end if;
  if jsonb_typeof(p_settings -> 'watermarkOffsetY') = 'number' then
    v_offset_y := least(-25, greatest(-65, round((p_settings ->> 'watermarkOffsetY')::numeric)))::integer;
  end if;
  if jsonb_typeof(p_settings -> 'watermarkSize') = 'number' then
    v_size := least(112, greatest(55, round((p_settings ->> 'watermarkSize')::numeric)))::integer;
  end if;

  if p_settings ? 'boardBadges' then
    if jsonb_typeof(p_settings -> 'boardBadges') <> 'object' then
      raise exception using errcode = '22023', message = 'INVALID_BOARD_BADGES';
    end if;

    for v_badge_key, v_badge_value in
      select key, value from jsonb_each(p_settings -> 'boardBadges')
    loop
      if v_badge_key not in (
        'manager-thong-soai',
        'manager-dai-tuong',
        'manager-thu-linh',
        'leader-ky-lan',
        'leader-phuong-hoang',
        'leader-su-tu'
      ) then
        raise exception using errcode = '22023', message = 'INVALID_BOARD_BADGE_KEY';
      end if;
      if jsonb_typeof(v_badge_value) <> 'string' then
        raise exception using errcode = '22023', message = 'INVALID_BOARD_BADGE_URL';
      end if;

      v_badge_url := btrim(v_badge_value #>> '{}');
      if v_badge_url = '' then
        continue;
      end if;
      if length(v_badge_url) > 2048 or v_badge_url !~ '^https://' then
        raise exception using errcode = '22023', message = 'INVALID_BOARD_BADGE_URL';
      end if;
      v_badges := v_badges || jsonb_build_object(v_badge_key, v_badge_url);
    end loop;
  end if;

  v_after := jsonb_build_object(
    'watermarkOpacity', v_opacity,
    'watermarkOffsetY', v_offset_y,
    'watermarkSize', v_size,
    'boardBadges', v_badges
  );

  select settings
  into v_before
  from public.app_visual_settings
  where id = 1
  for update;

  insert into public.app_visual_settings (id, settings, updated_at)
  values (1, v_after, now())
  on conflict (id) do update
    set settings = excluded.settings,
        updated_at = excluded.updated_at;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  ) values (
    v_actor_id,
    'visual_settings.update',
    'app_visual_settings',
    '1',
    coalesce(v_before, '{}'::jsonb),
    v_after,
    jsonb_build_object('source', 'admin_rpc')
  );

  return v_after;
end;
$$;

revoke execute on function public.set_app_visual_settings(jsonb) from public, anon, authenticated;
grant execute on function public.set_app_visual_settings(jsonb) to authenticated;

-- Adding a table twice to a publication raises an error, so keep reruns safe.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_visual_settings'
  ) then
    alter publication supabase_realtime add table public.app_visual_settings;
  end if;
end $$;
