-- Read the operator-maintained Bảng Đấu columns and make review approval explicit.

update public.sheet_mappings
set range_a1 = 'B1:N20',
    column_map = column_map ||
      '{"source_board_code":{"exact":"BẢNG ĐẤU","prefix":"BẢNG ĐẤU"}}'::jsonb,
    updated_at = now()
where code = 'DS_KV'
  and source_id in (
    select id from public.sheet_sources
    where spreadsheet_id = '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM'
  );

update public.sheet_mappings
set range_a1 = 'B1:S1000',
    column_map = column_map ||
      '{"source_board_code":{"exact":"BẢNG ĐẤU","prefix":"BẢNG ĐẤU"}}'::jsonb,
    updated_at = now()
where code = 'DS_TEAM'
  and source_id in (
    select id from public.sheet_sources
    where spreadsheet_id = '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM'
  );

update public.sheet_sources
set config = jsonb_set(
      coalesce(config, '{}'::jsonb),
      '{unresolvedCategories}',
      coalesce(config->'unresolvedCategories', '[]'::jsonb) - 'LEADER',
      true
    ),
    updated_at = now()
where spreadsheet_id = '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM';

update public.award_boards
set rule_config = rule_config || jsonb_build_object(
      'sourceMode', 'manual_or_derived',
      'sourceField', 'DS_KV.source_board_code',
      'derivationVersion', 'qlcn-best-team-manual-board-v4'
    ),
    updated_at = now()
where code in ('QLCN_THU_LINH', 'QLCN_DAI_TUONG', 'QLCN_THONG_SOAI');

update public.award_boards
set rule_config = rule_config || jsonb_build_object(
      'sourceMode', 'manual_or_derived',
      'sourceField', 'DS_TEAM.source_board_code',
      'metricPreferred', 'DS_TEAM.leader_metric_candidate',
      'metricFallback', 'DS_TEAM.best_team_metric',
      'groupBy', 'DS_TEAM.entity_code',
      'derivationVersion', 'leader-manual-board-by-employee-v1'
    ),
    updated_at = now()
where code in ('LEADER_SU_TU', 'LEADER_PHUONG_HOANG', 'LEADER_KY_LAN');

create or replace function public.approve_vinhdanh_import_batch(
  p_batch_id uuid,
  p_expected_warning_count integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_batch public.import_batches%rowtype;
  v_previous_status text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_review jsonb;
begin
  select role into v_role
  from public.vinhdanh_profiles
  where id = v_actor;

  if v_actor is null or v_role is null or
     v_role not in ('super_admin', 'admin', 'accounting') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_batch
  from public.import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_batch.status not in ('imported', 'needs_review') then
    raise exception 'IMPORT_BATCH_NOT_REVIEWABLE:%', v_batch.status
      using errcode = 'P0001';
  end if;
  if p_expected_warning_count is null or
     p_expected_warning_count <> v_batch.warning_count then
    raise exception 'STALE_WARNING_COUNT:expected %,actual %',
      p_expected_warning_count, v_batch.warning_count
      using errcode = '40001';
  end if;
  if v_batch.warning_count > 0 and v_note is null then
    raise exception 'REVIEW_NOTE_REQUIRED' using errcode = '22023';
  end if;

  v_previous_status := v_batch.status;

  v_review := jsonb_build_object(
    'approvedBy', v_actor,
    'approvedAt', now(),
    'warningCount', v_batch.warning_count,
    'note', v_note
  );

  update public.import_batches
  set status = 'validated',
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object('review', v_review)
  where id = p_batch_id
  returning * into v_batch;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, metadata
  ) values (
    v_actor,
    'sheet.import.approve',
    'import_batch',
    p_batch_id::text,
    jsonb_build_object(
      'status', v_previous_status,
      'warningCount', v_batch.warning_count
    ),
    jsonb_build_object(
      'status', 'validated',
      'review', v_review
    ),
    jsonb_build_object('explicitWarningApproval', v_batch.warning_count > 0)
  );

  return jsonb_build_object(
    'id', v_batch.id,
    'periodId', v_batch.period_id,
    'sequence', v_batch.sequence,
    'status', v_batch.status,
    'warningCount', v_batch.warning_count,
    'review', v_review
  );
end;
$$;

revoke all on function public.approve_vinhdanh_import_batch(uuid, integer, text)
  from public, anon;
grant execute on function public.approve_vinhdanh_import_batch(uuid, integer, text)
  to authenticated;
