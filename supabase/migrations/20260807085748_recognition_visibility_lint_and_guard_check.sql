-- JSON/JSONB operators used by the backfill helper are classified STABLE by
-- plpgsql_check on the hosted database. Match that volatility and run two
-- transactional self-checks: colon-bearing Team keys and stale READY rejection.

alter function public.vinhdanh_backfill_manifest_entity_codes(jsonb) stable;

do $$
declare
  v_manifest jsonb;
  v_batch_id uuid;
  v_release_id uuid;
begin
  v_manifest := public.vinhdanh_backfill_manifest_entity_codes(
    jsonb_build_object(
      'playlist', jsonb_build_array(
        jsonb_build_object(
          'kind', 'recognition',
          'recognition_board', jsonb_build_object(
            'entries', jsonb_build_array(
              jsonb_build_object(
                'employee_id', 'TEAM:TBC:MONEY:TBC:1',
                'name', 'MONEY'
              )
            )
          )
        )
      )
    )
  );

  if v_manifest #>> '{playlist,0,recognition_board,entries,0,entity_code}'
     <> 'TEAM:TBC:MONEY' then
    raise exception 'VISIBILITY_TEAM_KEY_SELF_TEST_FAILED';
  end if;

  select batch.id
  into v_batch_id
  from public.import_batches as batch
  order by batch.imported_at desc
  limit 1;

  -- A newly bootstrapped empty database has no batch yet, so only the pure
  -- Team-key check applies there. Production has a batch and also exercises
  -- the publication guard without leaving any test data behind.
  if v_batch_id is not null then
    insert into public.releases (
      release_version,
      period_id,
      import_batch_id,
      status,
      manifest,
      target_config
    ) values (
      'MIGRATION-VISIBILITY-GUARD-CHECK-20260807085748',
      '2099-12',
      v_batch_id,
      'ready',
      jsonb_build_object('playlist', '[]'::jsonb),
      '{"scope":"all","mode":"migration-self-test"}'::jsonb
    ) returning id into v_release_id;

    insert into public.recognition_visibility_rules (
      period_id,
      target_type,
      target_key,
      is_hidden,
      reason
    ) values (
      '2099-12',
      'person',
      'MIGRATION_TEST_PERSON',
      true,
      'transactional migration self-test'
    );

    begin
      update public.releases
      set status = 'published'
      where id = v_release_id;
      raise exception 'VISIBILITY_GUARD_SELF_TEST_FAILED';
    exception
      when serialization_failure then null;
    end;

    delete from public.recognition_visibility_rules
    where period_id = '2099-12'
      and target_type = 'person'
      and target_key = 'MIGRATION_TEST_PERSON';
    delete from public.releases where id = v_release_id;
  end if;
end;
$$;
