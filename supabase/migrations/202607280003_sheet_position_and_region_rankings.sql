-- Keep the recognition import anchored to the accounting-owned columns even
-- when a display header is accidentally renamed. columnIndex is zero-based
-- inside each configured A1 range.

update public.sheet_mappings
set column_map = column_map || jsonb_build_object(
      'manager_metric', jsonb_build_object(
        'prefix', 'TỔNG GDTC+HC T',
        'columnIndex', 10
      ),
      'source_board_code', jsonb_build_object(
        'exact', 'BẢNG ĐẤU',
        'prefix', 'BẢNG ĐẤU',
        'columnIndex', 12
      )
    ),
    updated_at = now()
where code = 'DS_KV'
  and source_id in (
    select id
    from public.sheet_sources
    where spreadsheet_id =
      '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM'
  );

update public.sheet_mappings
set column_map = column_map || jsonb_build_object(
      'total_gdtc_hc_metric', jsonb_build_object(
        'prefix', 'TỔNG GDTC+HC T',
        'columnIndex', 12
      ),
      'best_team_metric', jsonb_build_object(
        'exact', 'GDTC XÉT BEST TEAM',
        'columnIndex', 13
      ),
      'source_board_code', jsonb_build_object(
        'exact', 'BẢNG ĐẤU',
        'prefix', 'BẢNG ĐẤU',
        'columnIndex', 17
      )
    ),
    updated_at = now()
where code = 'DS_TEAM'
  and source_id in (
    select id
    from public.sheet_sources
    where spreadsheet_id =
      '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM'
  );

-- A QLCN row represents one managed region. The same employee may therefore
-- legitimately receive two positions when DOC1 and DFC both qualify.
update public.award_boards
set rule_config = rule_config || jsonb_build_object(
      'sourceMode', 'manual_only',
      'sourceField', 'DS_KV.source_board_code',
      'metric', 'DS_KV.manager_metric',
      'groupBy', 'DS_KV.source_row_key',
      'identity', jsonb_build_array('entity_code', 'branch_code'),
      'mergeRegions', false,
      'positiveOnly', true,
      'invalidRowPolicy', 'exclude_row',
      'derivationVersion',
        'qlcn-ds-kv-row-total-gdtc-hc-manual-board-v6'
    ),
    updated_at = now()
where code in (
  'QLCN_THU_LINH',
  'QLCN_DAI_TUONG',
  'QLCN_THONG_SOAI'
);

drop index if exists public.uq_award_results_batch_manager;

create index if not exists idx_award_results_batch_manager
  on public.award_results(batch_id, entity_code, branch_code)
  where entity_type = 'branch_manager' and entity_code is not null;

update public.award_boards
set rule_config = rule_config || jsonb_build_object(
      'positiveOnly', true,
      'tiePolicy', 'region_then_team_code',
      'derivationVersion', 'team-best-team-ranking-v2'
    ),
    updated_at = now()
where code = 'TEAM_RANKING';

update public.award_boards
set rule_config = rule_config || jsonb_build_object(
      'positiveOnly', true,
      'invalidRowPolicy', 'exclude_row',
      'derivationVersion',
        'leader-ds-team-valid-rows-best-team-manual-board-v3'
    ),
    updated_at = now()
where code in (
  'LEADER_SU_TU',
  'LEADER_PHUONG_HOANG',
  'LEADER_KY_LAN'
);
