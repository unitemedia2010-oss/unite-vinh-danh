export const SUPABASE_BOARD_CODE_BY_LOCAL_ID: Readonly<Record<string, string>> = {
  'manager-thong-soai': 'QLCN_THONG_SOAI',
  'manager-dai-tuong': 'QLCN_DAI_TUONG',
  'manager-thu-linh': 'QLCN_THU_LINH',
  'leader-ky-lan': 'LEADER_KY_LAN',
  'leader-phuong-hoang': 'LEADER_PHUONG_HOANG',
  'leader-su-tu': 'LEADER_SU_TU',
  'sale-fulltime': 'SALE_FULL_TIME',
  'sale-parttime': 'SALE_PART_TIME',
  'team-ranking': 'TEAM_RANKING',
}

export const LOCAL_BOARD_ID_BY_SUPABASE_CODE = Object.fromEntries(
  Object.entries(SUPABASE_BOARD_CODE_BY_LOCAL_ID).map(([localId, code]) => [code, localId]),
) as Readonly<Record<string, string>>
