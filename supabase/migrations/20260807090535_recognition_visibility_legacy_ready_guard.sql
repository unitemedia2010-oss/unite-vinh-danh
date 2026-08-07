-- Imported READY releases created before visibility revisions existed cannot
-- prove which hide/show state they contain. Reject them unconditionally; Admin
-- must create a fresh READY candidate from the current rules.

create or replace function public.guard_vinhdanh_visibility_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_revision text;
  v_current_revision text;
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

    if v_expected_revision is null
       or v_expected_revision <> v_current_revision then
      raise exception 'VISIBILITY_RULES_CHANGED_RECREATE_RELEASE'
        using errcode = '40001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_vinhdanh_visibility_publish()
  from public, anon, authenticated;

do $$
declare
  v_batch_id uuid;
  v_release_id uuid;
begin
  select batch.id
  into v_batch_id
  from public.import_batches as batch
  order by batch.imported_at desc
  limit 1;

  if v_batch_id is not null then
    insert into public.releases (
      release_version,
      period_id,
      import_batch_id,
      status,
      manifest,
      target_config
    ) values (
      'MIGRATION-LEGACY-READY-GUARD-CHECK-20260807090535',
      '2099-11',
      v_batch_id,
      'ready',
      jsonb_build_object('playlist', '[]'::jsonb),
      '{"scope":"all","mode":"migration-self-test"}'::jsonb
    ) returning id into v_release_id;

    update public.releases
    set manifest = manifest - 'visibility_revision'
    where id = v_release_id;

    begin
      update public.releases
      set status = 'published'
      where id = v_release_id;
      raise exception 'VISIBILITY_LEGACY_READY_SELF_TEST_FAILED';
    exception
      when serialization_failure then null;
    end;

    delete from public.releases where id = v_release_id;
  end if;
end;
$$;
