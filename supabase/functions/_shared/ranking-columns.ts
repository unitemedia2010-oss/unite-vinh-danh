export type RankingColumnSelection = {
  team: "M" | "O";
  manager: "K" | "L";
};

export type RankingColumnUpdate = {
  code: "DS_TEAM" | "DS_KV";
  metricField: "best_team_metric" | "manager_metric";
  column: RankingColumnSelection["team"] | RankingColumnSelection["manager"];
  columnIndex: number;
  rule: {
    exact?: string;
    prefix?: string;
    columnIndex: number;
  };
  label: string;
  mode: "deposit" | "gdtc";
};

export function parseRankingColumnSelection(
  value: unknown,
): RankingColumnSelection | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("RANKING_COLUMNS_INVALID");
  }

  const input = value as Record<string, unknown>;
  if (
    (input.team !== "M" && input.team !== "O") ||
    (input.manager !== "K" && input.manager !== "L")
  ) {
    throw new Error("RANKING_COLUMNS_INVALID");
  }

  return {
    team: input.team,
    manager: input.manager,
  };
}

export function buildRankingColumnUpdates(
  selection: RankingColumnSelection,
): RankingColumnUpdate[] {
  const team: RankingColumnUpdate = selection.team === "M"
    ? {
      code: "DS_TEAM",
      metricField: "best_team_metric",
      column: "M",
      columnIndex: 11,
      rule: { prefix: "TỔNG CỌC T", columnIndex: 11 },
      label: "DS-TEAM cột M · TỔNG CỌC Tn",
      mode: "deposit",
    }
    : {
      code: "DS_TEAM",
      metricField: "best_team_metric",
      column: "O",
      columnIndex: 13,
      rule: { exact: "GDTC XÉT BEST TEAM", columnIndex: 13 },
      label: "DS-TEAM cột O · GDTC XÉT BEST TEAM",
      mode: "gdtc",
    };

  const manager: RankingColumnUpdate = selection.manager === "K"
    ? {
      code: "DS_KV",
      metricField: "manager_metric",
      column: "K",
      columnIndex: 9,
      rule: { prefix: "TỔNG CỌC T", columnIndex: 9 },
      label: "DS-KV cột K · TỔNG CỌC Tn",
      mode: "deposit",
    }
    : {
      code: "DS_KV",
      metricField: "manager_metric",
      column: "L",
      columnIndex: 10,
      rule: { prefix: "TỔNG GDTC+HC T", columnIndex: 10 },
      label: "DS-KV cột L · TỔNG GDTC+HC Tn",
      mode: "gdtc",
    };

  return [team, manager];
}

export function rankingSelectionMode(
  selection: RankingColumnSelection,
): "deposit" | "gdtc" | "mixed" {
  if (selection.team === "M" && selection.manager === "K") return "deposit";
  if (selection.team === "O" && selection.manager === "L") return "gdtc";
  return "mixed";
}
