-- Period-scoped emergency visibility controls for recognition releases.
-- Sheet data and award_results remain immutable; every release manifest is
-- filtered at creation time so TV/public share never receives hidden content.

create table public.recognition_visibility_rules (
  id uuid primary key default gen_random_uuid(),
  period_id text not null check (
    period_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  target_type text not null check (target_type in ('person', 'board')),
  target_key text not null check (
    nullif(btrim(target_key), '') is not null
    and target_key = upper(btrim(target_key))
  ),
  is_hidden boolean not null default true,
  reason text check (
    not is_hidden or nullif(btrim(coalesce(reason, '')), '') is not null
  ),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, target_type, target_key)
);

create index recognition_visibility_rules_active_idx
  on public.recognition_visibility_rules (period_id, target_type, target_key)
  where is_hidden;

create trigger trg_recognition_visibility_rules_updated_at
before update on public.recognition_visibility_rules
for each row execute function public.vinhdanh_set_updated_at();

alter table public.recognition_visibility_rules enable row level security;

revoke all on table public.recognition_visibility_rules
  from public, anon, authenticated;
grant select on table public.recognition_visibility_rules to authenticated;
grant all on table public.recognition_visibility_rules to service_role;

create policy recognition_visibility_rules_staff_read
on public.recognition_visibility_rules
for select to authenticated
using (exists (
  select 1
  from public.vinhdanh_profiles as profile
  where profile.id = (select auth.uid())
    and profile.role in ('super_admin', 'admin', 'publisher')
));

create or replace function public.set_vinhdanh_visibility_rule(
  p_period_id text,
  p_target_type text,
  p_target_key text,
  p_hidden boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_period_id text := btrim(coalesce(p_period_id, ''));
  v_target_type text := lower(btrim(coalesce(p_target_type, '')));
  v_target_key text := upper(btrim(coalesce(p_target_key, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_before public.recognition_visibility_rules%rowtype;
  v_after public.recognition_visibility_rules%rowtype;
begin
  select profile.role
  into v_role
  from public.vinhdanh_profiles as profile
  where profile.id = v_actor;

  if v_actor is null or v_role is null or
     v_role not in ('super_admin', 'admin') then
    raise exception 'VISIBILITY_RULE_FORBIDDEN'
      using errcode = '42501';
  end if;

  if v_period_id !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or
     v_target_type not in ('person', 'board') or
     v_target_key = '' then
    raise exception 'VISIBILITY_RULE_INVALID'
      using errcode = '22023';
  end if;

  if coalesce(p_hidden, false) and v_reason is null then
    raise exception 'VISIBILITY_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  if v_target_type = 'board' and not exists (
    select 1
    from public.award_boards as board
    where upper(board.code) = v_target_key
  ) then
    raise exception 'VISIBILITY_BOARD_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_target_type = 'person' and coalesce(p_hidden, false) and not exists (
    select 1
    from public.award_results as result
    join public.import_batches as batch on batch.id = result.batch_id
    where batch.period_id = v_period_id
      and upper(btrim(coalesce(result.entity_code, ''))) = v_target_key
  ) then
    raise exception 'VISIBILITY_PERSON_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select rule.*
  into v_before
  from public.recognition_visibility_rules as rule
  where rule.period_id = v_period_id
    and rule.target_type = v_target_type
    and rule.target_key = v_target_key
  for update;

  insert into public.recognition_visibility_rules (
    period_id,
    target_type,
    target_key,
    is_hidden,
    reason,
    created_by,
    updated_by
  ) values (
    v_period_id,
    v_target_type,
    v_target_key,
    coalesce(p_hidden, false),
    v_reason,
    v_actor,
    v_actor
  )
  on conflict (period_id, target_type, target_key) do update
  set
    is_hidden = excluded.is_hidden,
    reason = excluded.reason,
    updated_by = excluded.updated_by
  returning * into v_after;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  ) values (
    v_actor,
    case when v_after.is_hidden
      then 'recognition_visibility.hide'
      else 'recognition_visibility.show'
    end,
    'recognition_visibility_rule',
    v_after.id::text,
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    jsonb_build_object(
      'periodId', v_period_id,
      'targetType', v_target_type,
      'targetKey', v_target_key
    )
  );

  return jsonb_build_object(
    'id', v_after.id,
    'periodId', v_after.period_id,
    'targetType', v_after.target_type,
    'targetKey', v_after.target_key,
    'hidden', v_after.is_hidden,
    'reason', v_after.reason,
    'updatedAt', v_after.updated_at
  );
end;
$$;

revoke all on function public.set_vinhdanh_visibility_rule(
  text,
  text,
  text,
  boolean,
  text
) from public, anon;
grant execute on function public.set_vinhdanh_visibility_rule(
  text,
  text,
  text,
  boolean,
  text
) to authenticated;

comment on function public.set_vinhdanh_visibility_rule(
  text,
  text,
  text,
  boolean,
  text
) is
  'Audited, reversible, period-scoped visibility control for one person or award board.';

create or replace function public.apply_vinhdanh_visibility_to_manifest(
  p_manifest jsonb,
  p_period_id text
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_entry jsonb;
  v_board_code text;
  v_person_key text;
  v_entries jsonb;
  v_playlist jsonb := '[]'::jsonb;
  v_board_hidden boolean;
  v_item_hidden boolean;
  v_original_enabled boolean;
  v_recognition_count integer := 0;
  v_visible_recognition_count integer := 0;
begin
  if p_manifest is null or jsonb_typeof(p_manifest->'playlist') <> 'array' or
     nullif(btrim(coalesce(p_period_id, '')), '') is null then
    return p_manifest;
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_manifest->'playlist')
      with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    v_board_code := public.vinhdanh_manifest_board_code(v_item);

    if lower(coalesce(v_item->>'kind', v_item->>'type', '')) = 'recognition'
       and v_board_code is not null then
      v_recognition_count := v_recognition_count + 1;
      v_board_hidden := exists (
        select 1
        from public.recognition_visibility_rules as rule
        where rule.period_id = p_period_id
          and rule.target_type = 'board'
          and rule.target_key = upper(v_board_code)
          and rule.is_hidden
      );

      v_original_enabled := case
        when lower(coalesce(v_item->>'visibility_original_enabled', '')) in ('true', 'false')
          then (v_item->>'visibility_original_enabled')::boolean
        when lower(coalesce(v_item->'web_config'->>'enabled', '')) in ('true', 'false')
          then (v_item->'web_config'->>'enabled')::boolean
        else true
      end;
      v_item := v_item || jsonb_build_object(
        'visibility_original_enabled', v_original_enabled
      );

      if jsonb_typeof(v_item->'recognition_board'->'entries') = 'array' then
        v_entries := '[]'::jsonb;
        for v_entry in
          select entry.value
          from jsonb_array_elements(v_item->'recognition_board'->'entries')
            with ordinality as entry(value, ordinality)
          order by entry.ordinality
        loop
          v_person_key := upper(btrim(coalesce(
            nullif(v_entry->>'entity_code', ''),
            nullif(split_part(coalesce(v_entry->>'employee_id', ''), ':', 1), ''),
            ''
          )));
          if not v_board_hidden and v_person_key <> '' and exists (
            select 1
            from public.recognition_visibility_rules as rule
            where rule.period_id = p_period_id
              and rule.target_type = 'person'
              and rule.target_key = v_person_key
              and rule.is_hidden
          ) then
            continue;
          end if;
          v_entries := v_entries || jsonb_build_array(v_entry);
        end loop;

        v_item := jsonb_set(
          v_item,
          '{recognition_board,entries}',
          v_entries,
          true
        );
        v_item_hidden := v_board_hidden or jsonb_array_length(v_entries) = 0;
      else
        v_item_hidden := v_board_hidden;
      end if;

      v_item := v_item || jsonb_build_object(
        'visibility_hidden', v_item_hidden,
        'web_config', coalesce(v_item->'web_config', '{}'::jsonb) ||
          jsonb_build_object(
            'enabled', case when v_item_hidden then false else v_original_enabled end
          )
      );
      if not v_item_hidden then
        v_visible_recognition_count := v_visible_recognition_count + 1;
      end if;
    end if;

    v_playlist := v_playlist || jsonb_build_array(v_item);
  end loop;

  if v_recognition_count > 0 and v_visible_recognition_count = 0 then
    raise exception 'NO_VISIBLE_RECOGNITION_BOARD'
      using errcode = 'P0001';
  end if;

  return jsonb_set(p_manifest, '{playlist}', v_playlist, true);
end;
$$;

revoke all on function public.apply_vinhdanh_visibility_to_manifest(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.apply_vinhdanh_visibility_to_manifest(jsonb, text)
  to service_role;

create or replace function public.filter_vinhdanh_release_visibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.manifest := public.apply_vinhdanh_visibility_to_manifest(
    new.manifest,
    new.period_id
  );
  return new;
end;
$$;

revoke all on function public.filter_vinhdanh_release_visibility()
  from public, anon, authenticated;

drop trigger if exists trg_releases_visibility_filter on public.releases;
create trigger trg_releases_visibility_filter
before insert on public.releases
for each row execute function public.filter_vinhdanh_release_visibility();

comment on table public.recognition_visibility_rules is
  'Admin visibility decisions. Source Sheet and award_results are never modified.';
