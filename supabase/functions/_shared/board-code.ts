import { normalizeText } from "./sheet.ts";

export type ManualBoardCode =
  | "QLCN_THU_LINH"
  | "QLCN_DAI_TUONG"
  | "QLCN_THONG_SOAI"
  | "LEADER_SU_TU"
  | "LEADER_PHUONG_HOANG"
  | "LEADER_KY_LAN";

const BOARD_ALIASES: Record<string, ManualBoardCode> = {
  "THU LINH": "QLCN_THU_LINH",
  "QLCN THU LINH": "QLCN_THU_LINH",
  "TUONG QUAN": "QLCN_DAI_TUONG",
  "DAI TUONG": "QLCN_DAI_TUONG",
  "QLCN DAI TUONG": "QLCN_DAI_TUONG",
  "THONG SOAI": "QLCN_THONG_SOAI",
  "QLCN THONG SOAI": "QLCN_THONG_SOAI",
  "SU TU": "LEADER_SU_TU",
  "LEADER SU TU": "LEADER_SU_TU",
  "PHUONG HOANG": "LEADER_PHUONG_HOANG",
  "LEADER PHUONG HOANG": "LEADER_PHUONG_HOANG",
  "KY LAN": "LEADER_KY_LAN",
  "LEADER KY LAN": "LEADER_KY_LAN",
};

export function normalizeManualBoardCode(
  value: string | null | undefined,
): ManualBoardCode | null {
  const normalized = normalizeText(value).replace(/[_-]+/g, " ").replace(
    /\s+/g,
    " ",
  );
  return normalized ? BOARD_ALIASES[normalized] ?? null : null;
}

export function isQlcnBoardCode(
  value: ManualBoardCode,
): value is Extract<ManualBoardCode, `QLCN_${string}`> {
  return value.startsWith("QLCN_");
}

export function isLeaderBoardCode(
  value: ManualBoardCode,
): value is Extract<ManualBoardCode, `LEADER_${string}`> {
  return value.startsWith("LEADER_");
}
