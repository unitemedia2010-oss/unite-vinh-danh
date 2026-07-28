/**
 * Unite Vinh Danh - Google Sheet change watcher.
 *
 * Bind this script to the accounting workbook. Secrets belong in Apps Script
 * Project Settings > Script properties, never in this source file.
 */

const VD_HANDLERS = Object.freeze({
  edit: 'markVinhDanhDirty',
  poll: 'pollVinhDanhSheet',
  debounce: 'processVinhDanhSyncDebounced',
});

const VD_DEFAULT_WATCH_RANGES = Object.freeze([
  'DS-KV!B1:N20',
  'DS-TEAM!B1:S1000',
]);

const VD_STATE_KEYS = Object.freeze([
  'INSTALLED_AT',
  'DIRTY_AT',
  'OBSERVED_FINGERPRINT',
  'OBSERVED_AT_MS',
  'LAST_OBSERVED_AT',
  'SUBMITTED_FINGERPRINT',
  'LAST_SUBMITTED_AT',
  'LAST_HTTP_STATUS',
  'LAST_RESULT',
  'LAST_ERROR_AT',
  'LAST_ERROR',
]);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('UNITE Vinh Danh')
    .addItem('Cài trigger đồng bộ', 'installVinhDanhSync')
    .addItem('Kiểm tra thay đổi ngay', 'pollVinhDanhSheet')
    .addItem('Xem trạng thái', 'showVinhDanhSyncStatus')
    .addSeparator()
    .addItem('Gỡ trigger đồng bộ', 'uninstallVinhDanhSync')
    .addToUi();
}

function installVinhDanhSync() {
  const config = vdConfig_();
  uninstallVinhDanhSync();

  ScriptApp.newTrigger(VD_HANDLERS.edit)
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  ScriptApp.newTrigger(VD_HANDLERS.poll)
    .timeBased()
    .everyMinutes(config.pollMinutes)
    .create();

  const state = PropertiesService.getDocumentProperties();
  // Keep Document Properties owned by other workflows in the same workbook.
  VD_STATE_KEYS.forEach(function (key) { state.deleteProperty(key); });
  state.setProperty('INSTALLED_AT', new Date().toISOString());
  SpreadsheetApp.getUi().alert(
    'Đã cài đồng bộ an toàn. Sửa trực tiếp sẽ được debounce; công thức được kiểm tra mỗi ' +
      config.pollMinutes + ' phút.',
  );
}

function uninstallVinhDanhSync() {
  const handlers = Object.values(VD_HANDLERS);
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/** Installable onEdit handler. It only marks dirty and schedules one deferred
 * check, allowing dependent formulas to settle before the backend reads them. */
function markVinhDanhDirty() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return;
  try {
    const state = PropertiesService.getDocumentProperties();
    state.setProperty('DIRTY_AT', new Date().toISOString());
    vdEnsureOneShotTrigger_();
  } finally {
    lock.releaseLock();
  }
}

function processVinhDanhSyncDebounced() {
  vdDeleteTriggersByHandler_(VD_HANDLERS.debounce);
  pollVinhDanhSheet();
}

/**
 * Polling is required even with onEdit: Google Sheets does not fire onEdit when
 * a formula, IMPORTRANGE, QUERY or another data source recalculates by itself.
 */
function pollVinhDanhSheet() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;
  try {
    const config = vdConfig_();
    const state = PropertiesService.getDocumentProperties();
    SpreadsheetApp.flush();
    Utilities.sleep(config.formulaSettleMs);

    const fingerprint = vdWorkbookFingerprint_(config.watchRanges);
    const now = Date.now();
    const previous = state.getProperty('OBSERVED_FINGERPRINT');
    const observedAt = Number(state.getProperty('OBSERVED_AT_MS') || '0');

    if (previous !== fingerprint) {
      state.setProperties({
        OBSERVED_FINGERPRINT: fingerprint,
        OBSERVED_AT_MS: String(now),
        LAST_OBSERVED_AT: new Date(now).toISOString(),
      });
      vdEnsureOneShotTrigger_(config.stableSeconds * 1000);
      return;
    }

    const stableForSeconds = Math.floor((now - observedAt) / 1000);
    if (stableForSeconds < config.stableSeconds) {
      vdEnsureOneShotTrigger_((config.stableSeconds - stableForSeconds) * 1000);
      return;
    }
    if (state.getProperty('SUBMITTED_FINGERPRINT') === fingerprint) return;

    const result = vdCallSync_(config, fingerprint, stableForSeconds);
    state.setProperties({
      SUBMITTED_FINGERPRINT: fingerprint,
      LAST_SUBMITTED_AT: new Date().toISOString(),
      LAST_HTTP_STATUS: String(result.status),
      LAST_RESULT: result.summary,
    });
    state.deleteProperty('LAST_ERROR');
    state.deleteProperty('DIRTY_AT');
  } catch (error) {
    PropertiesService.getDocumentProperties().setProperties({
      LAST_ERROR_AT: new Date().toISOString(),
      LAST_ERROR: String(error && error.message ? error.message : error).slice(0, 500),
    });
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function showVinhDanhSyncStatus() {
  const state = PropertiesService.getDocumentProperties().getProperties();
  const message = [
    'Lần thấy dữ liệu: ' + (state.LAST_OBSERVED_AT || 'chưa có'),
    'Lần gửi Supabase: ' + (state.LAST_SUBMITTED_AT || 'chưa có'),
    'HTTP gần nhất: ' + (state.LAST_HTTP_STATUS || 'chưa có'),
    'Kết quả: ' + (state.LAST_RESULT || 'chưa có'),
    'Lỗi: ' + (state.LAST_ERROR || 'không'),
  ].join('\n');
  SpreadsheetApp.getUi().alert(message);
}

function vdConfig_() {
  const props = PropertiesService.getScriptProperties();
  const endpoint = String(props.getProperty('SYNC_ENDPOINT') || '').trim();
  const secret = String(props.getProperty('SYNC_SHARED_SECRET') || '');
  if (!/^https:\/\/[^\s]+\/functions\/v1\/sync-sheet(?:\?.*)?$/.test(endpoint)) {
    throw new Error('Thiếu hoặc sai Script property SYNC_ENDPOINT.');
  }
  if (secret.length < 32) {
    throw new Error('SYNC_SHARED_SECRET phải là chuỗi ngẫu nhiên ít nhất 32 ký tự.');
  }

  let watchRanges = VD_DEFAULT_WATCH_RANGES.slice();
  const rangesJson = props.getProperty('WATCH_RANGES_JSON');
  if (rangesJson) {
    const parsed = JSON.parse(rangesJson);
    if (!Array.isArray(parsed) || !parsed.length || parsed.some(function (item) {
      return typeof item !== 'string' || item.length > 120;
    })) {
      throw new Error('WATCH_RANGES_JSON phải là mảng A1 range hợp lệ.');
    }
    watchRanges = parsed;
  }

  const pollMinutes = Number(props.getProperty('POLL_MINUTES') || '5');
  if ([1, 5, 10, 15, 30].indexOf(pollMinutes) < 0) {
    throw new Error('POLL_MINUTES chỉ nhận 1, 5, 10, 15 hoặc 30.');
  }
  return {
    endpoint: endpoint,
    secret: secret,
    spreadsheetId: String(
      props.getProperty('SPREADSHEET_ID') || SpreadsheetApp.getActive().getId(),
    ).trim(),
    sourceId: String(props.getProperty('SOURCE_ID') || '').trim(),
    watchRanges: watchRanges,
    pollMinutes: pollMinutes,
    stableSeconds: Math.max(30, Math.min(600, Number(props.getProperty('STABLE_SECONDS') || '60'))),
    formulaSettleMs: Math.max(0, Math.min(5000, Number(props.getProperty('FORMULA_SETTLE_MS') || '1500'))),
  };
}

function vdWorkbookFingerprint_(watchRanges) {
  const spreadsheet = SpreadsheetApp.getActive();
  const chunks = watchRanges.map(function (a1) {
    const separator = a1.indexOf('!');
    if (separator <= 0) throw new Error('Range thiếu tên tab: ' + a1);
    const sheetName = a1.slice(0, separator);
    const rangeA1 = a1.slice(separator + 1);
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error('Không tìm thấy tab: ' + sheetName);
    const range = sheet.getRange(rangeA1);
    return {
      range: a1,
      displayValues: range.getDisplayValues(),
      formulas: range.getFormulas(),
    };
  });
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(chunks),
    Utilities.Charset.UTF_8,
  );
  return bytes.map(function (value) {
    return ('0' + ((value + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function vdCallSync_(config, fingerprint, stableForSeconds) {
  const observedAt = new Date().toISOString();
  const eventId = 'gas:' + observedAt.replace(/[^0-9]/g, '').slice(0, 17) + ':' + fingerprint.slice(0, 16);
  const payload = {
    spreadsheetId: config.spreadsheetId,
    force: false,
    trigger: {
      kind: 'apps_script',
      eventId: eventId,
      sourceFingerprint: fingerprint,
      observedAt: observedAt,
      stableForSeconds: stableForSeconds,
    },
  };
  if (config.sourceId) payload.sourceId = config.sourceId;

  const response = UrlFetchApp.fetch(config.endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': config.secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch (_) { /* Keep a bounded generic error. */ }
  if (status < 200 || status >= 300) {
    const code = parsed.error || ('HTTP_' + status);
    throw new Error('Supabase sync thất bại: ' + code);
  }
  return {
    status: status,
    summary: parsed.automaticRelease
      ? (parsed.unchanged
        ? 'Không đổi; bản ' + parsed.automaticRelease.releaseVersion + ' vẫn đang được dùng.'
        : 'Đã tự kiểm tra và phát bản ' + parsed.automaticRelease.releaseVersion + '.')
      : (parsed.unchanged
        ? 'Không đổi; snapshot hiện tại chưa đủ điều kiện tự phát.'
        : 'Đã đồng bộ nhưng chưa tạo được bản phát.'),
  };
}

function vdEnsureOneShotTrigger_(delayMs) {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === VD_HANDLERS.debounce;
  });
  if (exists) return;
  ScriptApp.newTrigger(VD_HANDLERS.debounce)
    .timeBased()
    // Apps Script documents one minute as the minimum duration for `after`.
    .after(Math.max(60000, Number(delayMs || 60000)))
    .create();
}

function vdDeleteTriggersByHandler_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
}
