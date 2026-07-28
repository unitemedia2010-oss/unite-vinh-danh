-- Lock daily recognition to the accounting-owned source columns.
-- QLCN: DS-KV.TỔNG GDTC+HC Tn (sum rows by MNV).
-- Leader/Team: DS-TEAM.GDTC XÉT BEST TEAM.
-- Bảng Đấu is mandatory for QLCN and Leader; no threshold fallback.

update public.sheet_mappings
set range_a1 = 'B1:N1000',
    column_map = column_map || jsonb_build_object(
      'manager_metric', jsonb_build_object('prefix', 'TỔNG GDTC+HC T'),
      'source_board_code', jsonb_build_object(
        'exact', 'BẢNG ĐẤU',
        'prefix', 'BẢNG ĐẤU'
      )
    ),
    filter_config = coalesce(filter_config, '{}'::jsonb) || jsonb_build_object(
      'numericRankOnly', true,
      'skipBlankName', false,
      'selectedRevenueField', 'manager_metric',
      'periodColumnField', 'manager_metric',
      'requiredUniqueColumns', jsonb_build_array(
        'manager_metric',
        'source_board_code'
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
set range_a1 = 'B1:S1000',
    column_map = (column_map - 'leader_metric_candidate') ||
      jsonb_build_object(
        'best_team_metric', jsonb_build_object(
          'exact', 'GDTC XÉT BEST TEAM'
        ),
        'total_gdtc_hc_metric', jsonb_build_object(
          'prefix', 'TỔNG GDTC+HC T'
        ),
        'source_board_code', jsonb_build_object(
          'exact', 'BẢNG ĐẤU',
          'prefix', 'BẢNG ĐẤU'
        )
      ),
    filter_config = coalesce(filter_config, '{}'::jsonb) || jsonb_build_object(
      'numericRankOnly', true,
      'skipBlankName', false,
      'selectedRevenueField', 'best_team_metric',
      'periodColumnField', 'total_gdtc_hc_metric',
      'requiredUniqueColumns', jsonb_build_array(
        'best_team_metric',
        'total_gdtc_hc_metric',
        'source_board_code'
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

update public.award_boards
set rule_config = rule_config || jsonb_build_object(
      'sourceMode', 'manual_only',
      'sourceField', 'DS_KV.source_board_code',
      'metric', 'DS_KV.manager_metric',
      'groupBy', 'DS_KV.entity_code',
      'mergeRegions', true,
      'derivationVersion', 'qlcn-ds-kv-total-gdtc-hc-manual-board-v5'
    ),
    updated_at = now()
where code in (
  'QLCN_THU_LINH',
  'QLCN_DAI_TUONG',
  'QLCN_THONG_SOAI'
);

update public.award_boards
set name = 'Tướng Quân',
    updated_at = now()
where code = 'QLCN_DAI_TUONG';

update public.award_boards
set rule_config = rule_config || jsonb_build_object(
      'sourceMode', 'manual_only',
      'sourceField', 'DS_TEAM.source_board_code',
      'metric', 'DS_TEAM.best_team_metric',
      'groupBy', 'DS_TEAM.entity_code',
      'derivationVersion', 'leader-ds-team-best-team-manual-board-v2'
    ),
    updated_at = now()
where code in (
  'LEADER_SU_TU',
  'LEADER_PHUONG_HOANG',
  'LEADER_KY_LAN'
);
