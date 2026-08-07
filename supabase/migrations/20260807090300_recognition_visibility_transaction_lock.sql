-- Serialize a period's rule mutation with publication. This closes the narrow
-- race where a rule could commit immediately after the publish guard read its
-- revision but before the publish transaction committed.

create or replace function public.lock_vinhdanh_visibility_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period_id text := case
    when tg_op = 'DELETE' then old.period_id
    else new.period_id
  end;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('vinhdanh_visibility:' || coalesce(v_period_id, ''), 0)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.lock_vinhdanh_visibility_period()
  from public, anon, authenticated;

drop trigger if exists trg_recognition_visibility_rules_period_lock
  on public.recognition_visibility_rules;
create trigger trg_recognition_visibility_rules_period_lock
before insert or update or delete on public.recognition_visibility_rules
for each row execute function public.lock_vinhdanh_visibility_period();

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
    perform pg_advisory_xact_lock(
      hashtextextended('vinhdanh_visibility:' || new.period_id, 0)
    );

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
