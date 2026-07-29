export type EmployeePhotoRow = {
  employee_code: string;
  photo_path: string | null;
};

export function normalizeEmployeeCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function indexEmployeePhotoRows(
  rows: EmployeePhotoRow[],
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const row of rows) {
    const code = normalizeEmployeeCode(row.employee_code);
    if (!code) continue;
    result.set(code, row.photo_path?.trim() || null);
  }
  return result;
}

export function employeePhotoHashSnapshot(
  employeeCodes: Iterable<string>,
  photos: ReadonlyMap<string, string | null>,
): Record<string, string | null> {
  const codes = [...new Set(
    [...employeeCodes].map(normalizeEmployeeCode).filter(Boolean),
  )].sort();
  return Object.fromEntries(codes.map((code) => [code, photos.get(code) ?? null]));
}

export function recognitionEntryEmployeeCode(
  boardCodeValue: unknown,
  entry: Record<string, unknown>,
): string | null {
  const boardCode = typeof boardCodeValue === "string"
    ? boardCodeValue.trim().toUpperCase()
    : "";
  if (!boardCode.startsWith("QLCN_") && !boardCode.startsWith("LEADER_")) {
    return null;
  }

  for (const field of ["entity_code", "employee_code", "employeeCode"]) {
    const code = normalizeEmployeeCode(entry[field]);
    if (code) return code;
  }

  const manifestId = typeof entry.employee_id === "string"
    ? entry.employee_id.trim()
    : "";
  if (!manifestId.includes(":")) return null;
  return normalizeEmployeeCode(manifestId.split(":", 1)[0]) || null;
}
