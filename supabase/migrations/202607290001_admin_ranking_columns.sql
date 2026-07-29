-- Let authorized operators switch the two accounting-owned ranking metrics
-- without exposing raw sheet_mappings JSON to the browser. Both mapping rows
-- are locked and updated in one transaction, with an audit trail.

create or replace function public.save_vinhdanh_ranking_columns(
  p_spreadsheet_id text,
  p_team_column text,
  p_manager_column text,
  p_expected_team_updated_at timestamptz default null,
  p_expected_manager_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_source public.sheet_sources%rowtype;
  v_team public.sheet_mappings%rowtype;
  v_manager public.sheet_mappings%rowtype;
  v_team_column text := upper(trim(coalesce(p_team_column, '')));
  v_manager_column text := upper(trim(coalesce(p_manager_column, '')));
  v_team_rule jsonb;
  v_manager_rule jsonb;
  v_team_label text;
  v_manager_label text;
  v_team_mode text;
  v_manager_mode text;
  v_changed boolean;
  v_changed_at timestamptz := clock_timestamp();
  v_team_updated_at timestamptz;
  v_manager_updated_at timestamptz;
  v_before jsonb;
  v_after jsonb;
begin
  select role
  into v_role
  from public.vinhdanh_profiles
  where id = v_actor;

  if v_actor is null or v_role is null or
     v_role not in ('super_admin', 'admin', 'accounting') then
    raise exception 'RANKING_COLUMNS_FORBIDDEN'
      using errcode = '42501';
  end if;

  if v_team_column not in ('M', 'O') or
     v_manager_column not in ('K', 'L') then
    raise exception 'RANKING_COLUMNS_INVALID'
      using errcode = '22023';
  end if;

  select *
  into v_source
  from public.sheet_sources
  where spreadsheet_id = trim(p_spreadsheet_id)
    and is_active = true
  order by created_at
  limit 1;

  if v_source.id is null then
    raise exception 'SHEET_SOURCE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select sm.*
  into v_team
  from public.sheet_mappings sm
  where sm.source_id = v_source.id
    and sm.code = 'DS_TEAM'
    and sm.is_active = true
  for update;

  select sm.*
  into v_manager
  from public.sheet_mappings sm
  where sm.source_id = v_source.id
    and sm.code = 'DS_KV'
    and sm.is_active = true
  for update;

  if v_team.id is null or v_manager.id is null then
    raise exception 'RANKING_MAPPINGS_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if upper(coalesce(v_team.range_a1, '')) !~ '^B[0-9]+:S[0-9]+$' or
     upper(coalesce(v_manager.range_a1, '')) !~ '^B[0-9]+:N[0-9]+$' then
    raise exception 'RANKING_MAPPING_RANGE_INVALID'
      using errcode = '22023';
  end if;

  if p_expected_team_updated_at is not null and
     v_team.updated_at is distinct from p_expected_team_updated_at then
    raise exception 'RANKING_COLUMNS_STALE'
      using errcode = '40001';
  end if;

  if p_expected_manager_updated_at is not null and
     v_manager.updated_at is distinct from p_expected_manager_updated_at then
    raise exception 'RANKING_COLUMNS_STALE'
      using errcode = '40001';
  end if;

  if v_team_column = 'M' then
    v_team_rule := jsonb_build_object(
      'prefix', 'TỔNG CỌC T',
      'columnIndex', 11
    );
    v_team_label := 'DS-TEAM cột M · TỔNG CỌC Tn';
    v_team_mode := 'deposit';
  else
    v_team_rule := jsonb_build_object(
      'exact', 'GDTC XÉT BEST TEAM',
      'columnIndex', 13
    );
    v_team_label := 'DS-TEAM cột O · GDTC XÉT BEST TEAM';
    v_team_mode := 'gdtc';
  end if;

  if v_manager_column = 'K' then
    v_manager_rule := jsonb_build_object(
      'prefix', 'TỔNG CỌC T',
      'columnIndex', 9
    );
    v_manager_label := 'DS-KV cột K · TỔNG CỌC Tn';
    v_manager_mode := 'deposit';
  else
    v_manager_rule := jsonb_build_object(
      'prefix', 'TỔNG GDTC+HC T',
      'columnIndex', 10
    );
    v_manager_label := 'DS-KV cột L · TỔNG GDTC+HC Tn';
    v_manager_mode := 'gdtc';
  end if;

  v_before := jsonb_build_object(
    'team', jsonb_build_object(
      'updatedAt', v_team.updated_at,
      'metricRule', v_team.column_map -> 'best_team_metric',
      'filterConfig', v_team.filter_config
    ),
    'manager', jsonb_build_object(
      'updatedAt', v_manager.updated_at,
      'metricRule', v_manager.column_map -> 'manager_metric',
      'filterConfig', v_manager.filter_config
    )
  );

  v_changed :=
    v_team.column_map -> 'best_team_metric' is distinct from v_team_rule or
    v_manager.column_map -> 'manager_metric' is distinct from v_manager_rule or
    coalesce(v_team.filter_config ->> 'rankingSourceColumn', '') <> v_team_column or
    coalesce(v_manager.filter_config ->> 'rankingSourceColumn', '') <> v_manager_column;

  if v_changed then
    update public.sheet_mappings
    set column_map = jsonb_set(
          coalesce(column_map, '{}'::jsonb),
          '{best_team_metric}',
          v_team_rule,
          true
        ),
        filter_config = coalesce(filter_config, '{}'::jsonb) ||
          jsonb_build_object(
            'selectedRevenueField', 'best_team_metric',
            'rankingSourceColumn', v_team_column,
            'rankingSourceLabel', v_team_label,
            'rankingSourceMode', v_team_mode,
            'rankingSourceUpdatedAt', v_changed_at,
            'rankingSourceUpdatedBy', v_actor
          )
    where id = v_team.id
    returning updated_at into v_team_updated_at;

    update public.sheet_mappings
    set column_map = jsonb_set(
          coalesce(column_map, '{}'::jsonb),
          '{manager_metric}',
          v_manager_rule,
          true
        ),
        filter_config = coalesce(filter_config, '{}'::jsonb) ||
          jsonb_build_object(
            'selectedRevenueField', 'manager_metric',
            'periodColumnField', 'manager_metric',
            'rankingSourceColumn', v_manager_column,
            'rankingSourceLabel', v_manager_label,
            'rankingSourceMode', v_manager_mode,
            'rankingSourceUpdatedAt', v_changed_at,
            'rankingSourceUpdatedBy', v_actor
          )
    where id = v_manager.id
    returning updated_at into v_manager_updated_at;

    v_after := jsonb_build_object(
      'team', jsonb_build_object(
        'column', v_team_column,
        'label', v_team_label,
        'metricRule', v_team_rule,
        'updatedAt', v_team_updated_at
      ),
      'manager', jsonb_build_object(
        'column', v_manager_column,
        'label', v_manager_label,
        'metricRule', v_manager_rule,
        'updatedAt', v_manager_updated_at
      )
    );

    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      metadata
    )
    values (
      v_actor,
      'ranking_columns_updated',
      'sheet_source',
      v_source.id::text,
      v_before,
      v_after,
      jsonb_build_object(
        'spreadsheetId', v_source.spreadsheet_id,
        'source', 'admin_imports'
      )
    );
  else
    v_team_updated_at := v_team.updated_at;
    v_manager_updated_at := v_manager.updated_at;
  end if;

  return jsonb_build_object(
    'changed', v_changed,
    'sourceId', v_source.id,
    'teamColumn', v_team_column,
    'managerColumn', v_manager_column,
    'teamLabel', v_team_label,
    'managerLabel', v_manager_label,
    'teamUpdatedAt', v_team_updated_at,
    'managerUpdatedAt', v_manager_updated_at
  );
end;
$$;

revoke all on function public.save_vinhdanh_ranking_columns(
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public;

revoke all on function public.save_vinhdanh_ranking_columns(
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from anon;

grant execute on function public.save_vinhdanh_ranking_columns(
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to authenticated;

comment on function public.save_vinhdanh_ranking_columns(
  text,
  text,
  text,
  timestamptz,
  timestamptz
) is
  'Atomically selects DS-TEAM M/O and DS-KV K/L ranking columns for Vinh Danh.';
