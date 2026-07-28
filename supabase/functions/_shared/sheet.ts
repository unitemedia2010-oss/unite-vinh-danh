export type ColumnRule = {
  exact?: string;
  prefix?: string;
  regex?: string;
  /** Zero-based, accounting-approved position inside the configured A1 range.
   * When present this is authoritative; header text is only a diagnostic. */
  columnIndex?: number;
};

export type SheetMapping = {
  id: string;
  code: string;
  entity_type: string;
  sheet_name: string;
  range_a1?: string | null;
  title_row: number;
  header_row: number;
  data_start_row: number;
  stop_labels?: string[] | null;
  column_map: Record<string, ColumnRule | string>;
  filter_config?: Record<string, unknown> | null;
  board_code?: string | null;
};

export type NormalizedSheetRow = {
  sourceRowKey: string;
  sourceRowNumber: number;
  entityType: string;
  entityCode: string | null;
  displayName: string | null;
  branchCode: string | null;
  teamCode: string | null;
  roleCode: string | null;
  sourceRank: number | null;
  sourceBoardCode: string | null;
  revenueVnd: number | null;
  displayRevenue: string | null;
  metrics: Record<string, unknown>;
  rawData: Record<string, unknown>;
  validationStatus: "ok" | "warning" | "error";
  validationMessages: string[];
};

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function extractExplicitPeriod(value: string): string | null {
  const match = value.match(/(?:THÁNG\s*|T\s*)(\d{1,2})\s*\/\s*(\d{4})/iu);
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return `${match[2]}-${String(month).padStart(2, "0")}`;
}

export function extractPeriod(value: string): string | null {
  const explicit = extractExplicitPeriod(value);
  if (explicit) return explicit;
  const dated = value.match(/(?:^|\D)(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})(?:\D|$)/u);
  const month = Number(dated?.[2]);
  const year = dated?.[3];
  if (!year) return null;
  if (month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function extractYear(value: string): string | null {
  return value.match(/(?:^|\D)(\d{4})(?:\D|$)/u)?.[1] ?? null;
}

function extractMetricMonth(value: string): number | null {
  const match = normalizeText(value).match(/(?:^|\s)T\s*(\d{1,2})$/u);
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? month : null;
}

export function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const text = String(value).trim();
  if (!text || /^#(REF|VALUE|N\/A|DIV\/0)!?$/i.test(text)) return null;
  const negative = text.startsWith("-");
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const parsed = Number(digits) * (negative ? -1 : 1);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function formatVnd(value: number | string | bigint | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  let integer: bigint;
  try {
    integer = typeof value === "bigint" ? value : BigInt(String(value).replace(/[^0-9-]/g, ""));
  } catch {
    return null;
  }
  const sign = integer < 0n ? "-" : "";
  const digits = (integer < 0n ? -integer : integer).toString();
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VNĐ`;
}

function findHeaderColumns(headers: string[], ruleInput: ColumnRule | string): number[] {
  const rule: ColumnRule = typeof ruleInput === "string" ? { exact: ruleInput } : ruleInput;
  if (rule.exact) {
    const expected = normalizeText(rule.exact);
    const indexes = headers.flatMap((header, index) =>
      normalizeText(header) === expected ? [index] : []
    );
    if (indexes.length) return indexes;
  }
  if (rule.prefix) {
    const expected = normalizeText(rule.prefix);
    const indexes = headers.flatMap((header, index) =>
      normalizeText(header).startsWith(expected) ? [index] : []
    );
    if (indexes.length) return indexes;
  }
  if (rule.regex) {
    const regex = new RegExp(rule.regex, "iu");
    const indexes = headers.flatMap((header, index) =>
      regex.test(header) ? [index] : []
    );
    if (indexes.length) return indexes;
  }
  return [];
}

function findColumns(headers: string[], ruleInput: ColumnRule | string): number[] {
  const rule: ColumnRule = typeof ruleInput === "string" ? { exact: ruleInput } : ruleInput;
  if (
    Number.isInteger(rule.columnIndex) && Number(rule.columnIndex) >= 0 &&
      Number(rule.columnIndex) < headers.length
  ) {
    return [Number(rule.columnIndex)];
  }
  return findHeaderColumns(headers, ruleInput);
}

function findColumn(headers: string[], ruleInput: ColumnRule | string): number {
  return findColumns(headers, ruleInput)[0] ?? -1;
}

function firstText(row: string[] | undefined): string {
  return (row ?? []).find((value) => String(value ?? "").trim())?.trim() ?? "";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCollapsedTitleHeader(
  row: string[],
  sourceRankRule: ColumnRule | string | undefined,
): { headers: string[]; title: string | null } {
  const headers = [...row];
  const rule = typeof sourceRankRule === "string" ? { exact: sourceRankRule } : sourceRankRule;
  const label = rule?.exact?.trim();
  if (!label) return { headers, title: null };

  const suffix = new RegExp(`\\s+${escapeRegex(label)}\\s*$`, "iu");
  for (let index = 0; index < headers.length; index += 1) {
    const cell = headers[index]?.trim() ?? "";
    if (!suffix.test(cell)) continue;
    const title = cell.replace(suffix, "").trim();
    if (!title) continue;
    headers[index] = label;
    return { headers, title };
  }
  return { headers, title: null };
}

function headerMatchScore(headers: string[], columnMap: SheetMapping["column_map"]): number {
  return Object.values(columnMap ?? {}).reduce(
    (score, rule) => score + (findColumn(headers, rule) >= 0 ? 1 : 0),
    0,
  );
}

export function normalizeSheetRows(matrix: string[][], mapping: SheetMapping): {
  title: string;
  periodId: string | null;
  headers: string[];
  rows: NormalizedSheetRow[];
  warnings: string[];
  blockingErrors: string[];
} {
  const configuredTitleIndex = Math.max(0, mapping.title_row - 1);
  const configuredHeaderIndex = Math.max(0, mapping.header_row - 1);
  const candidates = matrix
    .slice(0, Math.min(matrix.length, Math.max(8, configuredHeaderIndex + 3)))
    .map((row, index) => {
      const split = splitCollapsedTitleHeader(row, mapping.column_map?.source_rank);
      return {
        index,
        headers: split.headers,
        collapsedTitle: split.title,
        score: headerMatchScore(split.headers, mapping.column_map),
      };
    });
  const bestCandidate = candidates.reduce((best, candidate) => {
    if (!best || candidate.score > best.score) return candidate;
    if (candidate.score === best.score && candidate.index === configuredHeaderIndex) return candidate;
    return best;
  }, candidates[0]);
  const headerIndex = bestCandidate?.score ? bestCandidate.index : configuredHeaderIndex;
  const headers = bestCandidate?.score
    ? bestCandidate.headers
    : (matrix[configuredHeaderIndex] ?? []);
  const title = bestCandidate?.collapsedTitle || firstText(matrix[configuredTitleIndex]);
  const filterConfig = mapping.filter_config ?? {};
  const requiredUniqueColumns = new Set(
    Array.isArray(filterConfig.requiredUniqueColumns)
      ? filterConfig.requiredUniqueColumns.filter((field): field is string =>
        typeof field === "string" && field.trim().length > 0
      )
      : [],
  );
  const columnMatches = Object.fromEntries(
    Object.entries(mapping.column_map ?? {}).map(([field, rule]) => [field, findColumns(headers, rule)]),
  );
  const columnIndexes = Object.fromEntries(
    Object.entries(columnMatches).map(([field, indexes]) => [
      field,
      requiredUniqueColumns.has(field) && indexes.length !== 1
        ? -1
        : (indexes[0] ?? -1),
    ]),
  );
  const warnings: string[] = [];
  const blockingErrors: string[] = [];
  for (const [field, rule] of Object.entries(mapping.column_map ?? {})) {
    if (
      typeof rule === "object" && Number.isInteger(rule.columnIndex) &&
      !findHeaderColumns(headers, rule).includes(Number(rule.columnIndex)) &&
      columnIndexes[field] === rule.columnIndex
    ) {
      warnings.push(
        `${mapping.code}: tiêu đề cột ${field} không khớp; dùng vị trí cố định ${Number(rule.columnIndex) + 1} trong range`,
      );
    }
  }
  for (const [field, index] of Object.entries(columnIndexes)) {
    if (index < 0) warnings.push(`${mapping.code}: không tìm thấy cột ${field}`);
  }
  for (const field of requiredUniqueColumns) {
    const indexes = columnMatches[field] ?? [];
    if (indexes.length === 1) continue;
    const message = indexes.length === 0
      ? `${mapping.code}: thiếu cột bắt buộc duy nhất ${field}`
      : `${mapping.code}: có ${indexes.length} cột cùng khớp ${field}; từ chối chọn cột ngầm định`;
    blockingErrors.push(message);
  }

  // Daily workbooks title the snapshot with an observation date (for example
  // "ĐẾN 27/07/2026") while the metric itself may already be for T8. The
  // configured metric header is authoritative for the recognition month; the
  // title supplies only the year when it has no explicit T8/2026 period.
  const periodColumnField = typeof filterConfig.periodColumnField === "string"
    ? filterConfig.periodColumnField
    : null;
  const periodColumnIndex = periodColumnField
    ? (columnIndexes[periodColumnField] ?? -1)
    : -1;
  const metricMonth = periodColumnIndex >= 0
    ? extractMetricMonth(headers[periodColumnIndex] ?? "")
    : null;
  const metricPeriodId = metricMonth && extractYear(title)
    ? `${extractYear(title)}-${String(metricMonth).padStart(2, "0")}`
    : null;
  const explicitTitlePeriodId = extractExplicitPeriod(title);
  if (
    explicitTitlePeriodId && metricPeriodId &&
    explicitTitlePeriodId !== metricPeriodId
  ) {
    blockingErrors.push(
      `${mapping.code}: kỳ tiêu đề ${explicitTitlePeriodId} khác kỳ cột doanh số ${metricPeriodId}`,
    );
  }

  const stopLabels = (mapping.stop_labels ?? ["TỔNG"]).map(normalizeText);
  const numericRankOnly = filterConfig.numericRankOnly !== false;
  const skipBlankName = filterConfig.skipBlankName === true;
  const selectedRevenueField = typeof filterConfig.selectedRevenueField === "string"
    ? filterConfig.selectedRevenueField
    : "revenue_vnd";
  const normalizedRows: NormalizedSheetRow[] = [];

  // Google Visualization collapses title + header rows into one label row. Shift
  // data_start_row by the same delta after detecting the actual header position.
  const configuredDataIndex = Math.max(0, mapping.data_start_row - 1);
  const dataStartIndex = Math.max(0, configuredDataIndex + (headerIndex - configuredHeaderIndex));
  for (let matrixIndex = dataStartIndex; matrixIndex < matrix.length; matrixIndex += 1) {
    const source = matrix[matrixIndex] ?? [];
    const rankIndex = columnIndexes.source_rank ?? -1;
    const rankRaw = rankIndex >= 0 ? source[rankIndex] : firstText(source);
    if (stopLabels.includes(normalizeText(rankRaw))) break;
    const rank = parseInteger(rankRaw);
    if (numericRankOnly && rank === null) continue;

    const mapped: Record<string, string | null> = {};
    for (const [field, index] of Object.entries(columnIndexes)) {
      mapped[field] = index >= 0 ? (source[index]?.trim() || null) : null;
    }

    const displayName = mapped.display_name;
    if (skipBlankName && !displayName) continue;
    const entityCode = mapped.entity_code;
    const branchCode = mapped.branch_code;
    const teamCode = mapped.team_code;
    const messages: string[] = [];
    if (!entityCode && mapping.entity_type !== "team") messages.push("Thiếu mã nhân sự");
    if (!displayName && !teamCode) messages.push("Thiếu tên hiển thị/team");
    if (source.some((value) => /^#(REF|VALUE|N\/A|DIV\/0)!?$/i.test(value.trim()))) {
      messages.push("Dòng nguồn có lỗi công thức");
    }

    const metrics: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(mapped)) {
      if (["source_rank", "entity_code", "display_name", "branch_code", "team_code", "role_code", "source_board_code"].includes(field)) continue;
      metrics[field] = parseInteger(value) ?? value;
    }
    const revenueVnd = parseInteger(mapped[selectedRevenueField]);
    if (filterConfig.requiresRevenueSelection === true && !filterConfig.selectedRevenueField) {
      messages.push("Chưa chọn cột doanh số xét vinh danh");
    }

    const rawData: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header?.trim()) rawData[header.trim()] = source[index] ?? null;
    });

    const sourceRowNumber = matrixIndex + 1 - (headerIndex - configuredHeaderIndex);
    const identity = entityCode || teamCode || branchCode || `row-${sourceRowNumber}`;
    normalizedRows.push({
      sourceRowKey: `${mapping.code}:${sourceRowNumber}:${identity}`,
      sourceRowNumber,
      entityType: mapping.entity_type,
      entityCode,
      displayName: displayName || teamCode,
      branchCode,
      teamCode,
      roleCode: mapped.role_code,
      sourceRank: rank,
      sourceBoardCode: mapped.source_board_code || mapping.board_code || null,
      revenueVnd,
      displayRevenue: formatVnd(revenueVnd),
      metrics,
      rawData,
      validationStatus: messages.length ? "warning" : "ok",
      validationMessages: messages,
    });
  }

  return {
    title,
    periodId: explicitTitlePeriodId ?? metricPeriodId ?? extractPeriod(title),
    headers,
    rows: normalizedRows,
    warnings,
    blockingErrors,
  };
}

export function googleVisualizationCsvUrl(
  spreadsheetId: string,
  sheetName: string,
  rangeA1?: string | null,
  headerRows?: number | null,
): string {
  const params = new URLSearchParams({ tqx: "out:csv", sheet: sheetName });
  if (rangeA1) params.set("range", rangeA1);
  if (headerRows !== null && headerRows !== undefined) params.set("headers", String(headerRows));
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?${params}`;
}

export async function fetchPublicSheetCsv(
  spreadsheetId: string,
  sheetName: string,
  rangeA1?: string | null,
  headerRows?: number | null,
): Promise<string[][]> {
  const canonicalUrl = googleVisualizationCsvUrl(
    spreadsheetId,
    sheetName,
    rangeA1,
    headerRows,
  );
  // Apps Script can observe a formula recalculation before an intermediary
  // serves a fresh Visualization CSV. A per-request cache buster plus explicit
  // no-cache headers makes the Edge Function read the current workbook values.
  const separator = canonicalUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${canonicalUrl}${separator}_=${Date.now()}`, {
    headers: {
      "User-Agent": "Unite-VinhDanh-Sync/1.0",
      "Cache-Control": "no-cache, no-store",
      "Pragma": "no-cache",
    },
  });
  if (!response.ok) throw new Error(`Không đọc được tab ${sheetName}: HTTP ${response.status}`);
  return parseCsv(await response.text());
}
