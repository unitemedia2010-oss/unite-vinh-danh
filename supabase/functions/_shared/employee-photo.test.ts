import {
  employeePhotoHashSnapshot,
  indexEmployeePhotoRows,
  recognitionEntryEmployeeCode,
} from "./employee-photo.ts";

Deno.test("employee photos are indexed and hashed deterministically by normalized MNV", () => {
  const photos = indexEmployeePhotoRows([
    { employee_code: " u177 ", photo_path: "profiles/U177/avatar.png" },
    { employee_code: "U261", photo_path: null },
  ]);

  const snapshot = employeePhotoHashSnapshot(["u261", "U177", "u177"], photos);
  if (JSON.stringify(snapshot) !== JSON.stringify({
    U177: "profiles/U177/avatar.png",
    U261: null,
  })) {
    throw new Error(`Unexpected snapshot: ${JSON.stringify(snapshot)}`);
  }
});

Deno.test("manifest photo enrichment only accepts Leader and QLCN employee entries", () => {
  const entry = { employee_id: "U177:DOC1:1" };
  if (recognitionEntryEmployeeCode("QLCN_THONG_SOAI", entry) !== "U177") {
    throw new Error("QLCN employee code was not extracted");
  }
  if (recognitionEntryEmployeeCode("LEADER_KY_LAN", entry) !== "U177") {
    throw new Error("Leader employee code was not extracted");
  }
  if (recognitionEntryEmployeeCode("TEAM_RANKING", entry) !== null) {
    throw new Error("Team pseudo identity must never be treated as an employee");
  }
  if (recognitionEntryEmployeeCode("LEADER_KY_LAN", { employee_id: "leader-ky-lan-1" }) !== null) {
    throw new Error("Legacy demo identity must not be treated as an MNV");
  }
});
