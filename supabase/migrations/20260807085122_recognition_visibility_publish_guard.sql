-- Freeze the active visibility-rule set into every new release. If Admin
-- changes a rule after creating READY, publishing that stale candidate fails
-- closed and the currently live release remains untouched.

create or replace function public.vinhdanh_visibility_revision(p_period_id text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select md5(coalesce(string_agg(
    rule.target_type || ':' || rule.target_key,
    '|' order by rule.target_type, rule.target_key
  ), ''))
  from public.recognition_visibility_rules as rule
  where rule.period_id = p_period_id
    and rule.is_hidden;
$$;

revoke all on function public.vinhdanh_visibility_revision(text)
  from public, anon, authenticated;
grant execute on function public.vinhdanh_visibility_revision(text)
  to service_role;

-- Automatic Sheet releases encode an entry as
-- <entity_code>:<branch_code>:<rank>. Entity codes for Team contain colons
-- themselves (for example TEAM:TBC:MONEY), so split_part(..., ':', 1) is not
-- safe. Backfill the exact entity_code by removing only the final two parts
-- before the existing visibility filter runs.
create or replace function public.vinhdanh_backfill_manifest_entity_codes(
  p_manifest jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_entry jsonb;
  v_employee_id text;
  v_entity_code text;
  v_entries jsonb;
  v_playlist jsonb := '[]'::jsonb;
begin
  if p_manifest is null or jsonb_typeof(p_manifest->'playlist') <> 'array' then
    return p_manifest;
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_manifest->'playlist')
      with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    if lower(coalesce(v_item->>'kind', v_item->>'type', '')) = 'recognition'
       and jsonb_typeof(v_item->'recognition_board'->'entries') = 'array' then
      v_entries := '[]'::jsonb;
      for v_entry in
        select entry.value
        from jsonb_array_elements(v_item->'recognition_board'->'entries')
          with ordinality as entry(value, ordinality)
        order by entry.ordinality
      loop
        if nullif(btrim(coalesce(v_entry->>'entity_code', '')), '') is null then
          v_employee_id := btrim(coalesce(v_entry->>'employee_id', ''));
          if v_employee_id ~ ':[^:]*:[^:]*$' then
            v_entity_code := regexp_replace(
              v_employee_id,
              ':[^:]*:[^:]*$',
              ''
            );
            if nullif(v_entity_code, '') is not null then
              v_entry := v_entry || jsonb_build_object(
                'entity_code',
                v_entity_code
              );
            end if;
          end if;
        end if;
        v_entries := v_entries || jsonb_build_array(v_entry);
      end loop;

      v_item := jsonb_set(
        v_item,
        '{recognition_board,entries}',
        v_entries,
        true
      );
    end if;
    v_playlist := v_playlist || jsonb_build_array(v_item);
  end loop;

  return jsonb_set(p_manifest, '{playlist}', v_playlist, true);
end;
$$;

revoke all on function public.vinhdanh_backfill_manifest_entity_codes(jsonb)
  from public, anon, authenticated;
grant execute on function public.vinhdanh_backfill_manifest_entity_codes(jsonb)
  to service_role;

create or replace function public.filter_vinhdanh_release_visibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.manifest := public.apply_vinhdanh_visibility_to_manifest(
    public.vinhdanh_backfill_manifest_entity_codes(new.manifest),
    new.period_id
  ) || jsonb_build_object(
    'visibility_revision',
    public.vinhdanh_visibility_revision(new.period_id)
  );
  return new;
end;
$$;

revoke all on function public.filter_vinhdanh_release_visibility()
  from public, anon, authenticated;

create or replace function public.guard_vinhdanh_visibility_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_revision text;
  v_current_revision text;
  v_has_active_rules boolean;
begin
  if new.status = 'published'
     and old.status is distinct from 'published'
     and new.import_batch_id is not null
     and new.period_id is not null then
    v_expected_revision := nullif(
      btrim(coalesce(new.manifest->>'visibility_revision', '')),
      ''
    );
    v_current_revision := public.vinhdanh_visibility_revision(new.period_id);

    if v_expected_revision is null then
      select exists (
        select 1
        from public.recognition_visibility_rules as rule
        where rule.period_id = new.period_id
          and rule.is_hidden
      ) into v_has_active_rules;

      if v_has_active_rules then
        raise exception 'VISIBILITY_RULES_CHANGED_RECREATE_RELEASE'
          using errcode = '40001';
      end if;
    elsif v_expected_revision <> v_current_revision then
      raise exception 'VISIBILITY_RULES_CHANGED_RECREATE_RELEASE'
        using errcode = '40001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_vinhdanh_visibility_publish()
  from public, anon, authenticated;

drop trigger if exists trg_releases_visibility_publish_guard on public.releases;
create trigger trg_releases_visibility_publish_guard
before update on public.releases
for each row execute function public.guard_vinhdanh_visibility_publish();

comment on function public.guard_vinhdanh_visibility_publish() is
  'Rejects READY releases created against an older period visibility-rule set.';
