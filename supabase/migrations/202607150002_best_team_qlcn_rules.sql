-- Keep existing Supabase projects aligned with the confirmed July 2026 rules.
update public.award_boards
set rule_config = '{
  "min": 0,
  "maxExclusive": 300000000,
  "sourceMode": "derived",
  "metric": "DS_TEAM.best_team_metric",
  "groupBy": "DS_KV.manager_employee_code",
  "mergeRegions": true,
  "derivationVersion": "qlcn-best-team-by-region-v3"
}'::jsonb
where code = 'QLCN_THU_LINH';

update public.award_boards
set rule_config = '{
  "min": 300000000,
  "maxExclusive": 500000000,
  "sourceMode": "derived",
  "metric": "DS_TEAM.best_team_metric",
  "groupBy": "DS_KV.manager_employee_code",
  "mergeRegions": true,
  "derivationVersion": "qlcn-best-team-by-region-v3"
}'::jsonb
where code = 'QLCN_DAI_TUONG';

update public.award_boards
set rule_config = '{
  "min": 500000000,
  "sourceMode": "derived",
  "metric": "DS_TEAM.best_team_metric",
  "groupBy": "DS_KV.manager_employee_code",
  "mergeRegions": true,
  "derivationVersion": "qlcn-best-team-by-region-v3"
}'::jsonb
where code = 'QLCN_THONG_SOAI';

update public.award_boards
set rule_config = '{
  "sourceMode": "derived",
  "metric": "DS_TEAM.best_team_metric",
  "identity": ["branch_code", "team_code"],
  "requireRegion": true,
  "positiveOnly": true,
  "derivationVersion": "team-best-team-ranking-v1"
}'::jsonb
where code = 'TEAM_RANKING';

update public.sheet_mappings
set range_a1 = 'B1:R1000'
where code = 'DS_TEAM'
  and sheet_name = 'DS-TEAM';
