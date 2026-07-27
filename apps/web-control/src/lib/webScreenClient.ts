const STORAGE_KEY = 'unite-vinhdanh.web-screen.credentials.v1'
const DEFAULT_FUNCTION_NAME = 'screen-api'
const DEFAULT_DEVICE_NAME = 'Web TV'
const DEFAULT_APP_VERSION = 'web-mvp'

type JsonRecord = Record<string, unknown>

export type WebScreenRegistrationState = 'pending' | 'approved' | 'revoked' | 'expired'

export interface WebScreenCredentials {
  deviceId: string
  deviceToken: string | null
  pairingCode: string | null
}

export interface WebScreenBranch {
  id: string
  code: string
  name: string
  address: string
}

export interface WebScreen {
  id: string
  screenCode: string
  name: string
  branchId: string
  branch: WebScreenBranch | null
}

export interface RegisterWebScreenOptions {
  deviceName?: string
  appVersion?: string
  signal?: AbortSignal
}

export interface RegisterWebScreenResult {
  registrationId: string
  pairingCode: string
  deviceToken: string
  status: WebScreenRegistrationState
  expiresAt: string
  deviceId: string
}

export interface WebScreenStatusResult {
  status: WebScreenRegistrationState
  screenId: string | null
  screen: WebScreen | null
  expiresAt: string
}

export interface WebScreenRelease {
  id: string
  releaseVersion: string
  periodId: string
  status: string
  activateAt: string | null
  manifest: JsonRecord
  updatedAt: string
}

export interface WebScreenManifestResult {
  release: WebScreenRelease | null
  currentReleaseId: string | null
  screenId: string | null
  screen: WebScreen | null
  serverTime: string
}

export interface WebScreenHeartbeat {
  currentReleaseId?: string | null
  readyReleaseId?: string | null
  currentItemKey?: string | null
  lastError?: string | null
  appVersion?: string
  cacheState?: JsonRecord
  deviceInfo?: JsonRecord
  signal?: AbortSignal
}

export interface WebScreenHeartbeatResult {
  ok: true
  serverTime: string
}

export class WebScreenClientError extends Error {
  readonly code: string
  readonly httpStatus: number | null
  readonly retriable: boolean
  readonly details: JsonRecord | null

  constructor(
    code: string,
    message: string,
    options: {
      httpStatus?: number | null
      retriable?: boolean
      details?: JsonRecord | null
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'WebScreenClientError'
    this.code = code
    this.httpStatus = options.httpStatus ?? null
    this.retriable = options.retriable ?? false
    this.details = options.details ?? null
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  SCREEN_API_NOT_CONFIGURED:
    'Web TV chưa được cấu hình Supabase. Cần VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.',
  STORAGE_UNAVAILABLE:
    'Trình duyệt không cho phép lưu thông tin ghép nối Web TV trong localStorage.',
  DEVICE_ID_GENERATION_FAILED:
    'Trình duyệt không hỗ trợ tạo mã thiết bị an toàn.',
  DEVICE_TOKEN_MISSING:
    'Web TV chưa có device token. Hãy đăng ký thiết bị và ghép nối lại.',
  DEVICE_ID_REQUIRED:
    'screen-api không nhận được mã thiết bị.',
  DEVICE_ALREADY_APPROVED:
    'Thiết bị này đã được duyệt. Hãy dùng device token đã lưu hoặc đặt lại thiết bị.',
  DEVICE_REVOKED:
    'Thiết bị đã bị thu hồi. Hãy đặt lại Web TV để tạo mã thiết bị mới.',
  DEVICE_UNAUTHORIZED:
    'Device token không hợp lệ hoặc đã bị thu hồi.',
  DEVICE_NOT_APPROVED:
    'Web TV đang chờ Admin duyệt mã ghép nối.',
  PAIRING_EXPIRED:
    'Mã ghép nối đã hết hạn. Hãy đăng ký lại để nhận mã mới.',
  METHOD_NOT_ALLOWED:
    'screen-api không chấp nhận phương thức yêu cầu này.',
  UNKNOWN_ACTION:
    'screen-api không hỗ trợ thao tác được yêu cầu.',
  INVALID_RESPONSE:
    'screen-api trả về dữ liệu không hợp lệ.',
  NETWORK_ERROR:
    'Không thể kết nối tới screen-api. Hãy kiểm tra mạng và cấu hình Supabase.',
  REQUEST_ABORTED:
    'Yêu cầu tới screen-api đã bị hủy.',
  SCREEN_API_FAILED:
    'screen-api gặp lỗi khi xử lý yêu cầu.',
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

const requiredString = (record: JsonRecord, key: string): string => {
  const value = nullableString(record[key])
  if (!value) {
    throw invalidResponse(`Thiếu trường "${key}" trong phản hồi screen-api.`, record)
  }
  return value
}

const registrationState = (value: unknown): WebScreenRegistrationState => {
  if (value === 'pending' || value === 'approved' || value === 'revoked' || value === 'expired') {
    return value
  }
  throw invalidResponse('Trạng thái đăng ký thiết bị không hợp lệ.', { status: value })
}

const invalidResponse = (message: string, details: JsonRecord | null = null) =>
  new WebScreenClientError('INVALID_RESPONSE', message, { details })

const browserStorage = (): Storage => {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new WebScreenClientError('STORAGE_UNAVAILABLE', ERROR_MESSAGES.STORAGE_UNAVAILABLE)
  }
  return window.localStorage
}

const generateDeviceId = (): string => {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return `web-${cryptoApi.randomUUID()}`
  if (!cryptoApi?.getRandomValues) {
    throw new WebScreenClientError(
      'DEVICE_ID_GENERATION_FAILED',
      ERROR_MESSAGES.DEVICE_ID_GENERATION_FAILED,
    )
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `web-${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

const saveCredentials = (credentials: WebScreenCredentials): WebScreenCredentials => {
  try {
    browserStorage().setItem(STORAGE_KEY, JSON.stringify(credentials))
    return credentials
  } catch (error) {
    throw new WebScreenClientError('STORAGE_UNAVAILABLE', ERROR_MESSAGES.STORAGE_UNAVAILABLE, {
      cause: error,
    })
  }
}

const readStoredCredentials = (): WebScreenCredentials | null => {
  let raw: string | null
  try {
    raw = browserStorage().getItem(STORAGE_KEY)
  } catch (error) {
    throw new WebScreenClientError('STORAGE_UNAVAILABLE', ERROR_MESSAGES.STORAGE_UNAVAILABLE, {
      cause: error,
    })
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !nullableString(parsed.deviceId)) {
      browserStorage().removeItem(STORAGE_KEY)
      return null
    }
    return {
      deviceId: requiredString(parsed, 'deviceId'),
      deviceToken: nullableString(parsed.deviceToken),
      pairingCode: nullableString(parsed.pairingCode),
    }
  } catch (error) {
    if (error instanceof WebScreenClientError) throw error
    try {
      browserStorage().removeItem(STORAGE_KEY)
    } catch {
      // The next write will surface a clear STORAGE_UNAVAILABLE error if needed.
    }
    return null
  }
}

export const getWebScreenCredentials = (): WebScreenCredentials => {
  const stored = readStoredCredentials()
  if (stored) return stored
  return saveCredentials({
    deviceId: generateDeviceId(),
    deviceToken: null,
    pairingCode: null,
  })
}

export const resetWebScreenCredentials = (keepDeviceId = false): WebScreenCredentials => {
  const currentDeviceId = keepDeviceId ? readStoredCredentials()?.deviceId : null
  try {
    browserStorage().removeItem(STORAGE_KEY)
  } catch (error) {
    throw new WebScreenClientError('STORAGE_UNAVAILABLE', ERROR_MESSAGES.STORAGE_UNAVAILABLE, {
      cause: error,
    })
  }
  return saveCredentials({
    deviceId: currentDeviceId ?? generateDeviceId(),
    deviceToken: null,
    pairingCode: null,
  })
}

const clientConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  const functionName = import.meta.env.VITE_SCREEN_API_FUNCTION?.trim() || DEFAULT_FUNCTION_NAME

  if (!supabaseUrl || !publicKey) {
    throw new WebScreenClientError(
      'SCREEN_API_NOT_CONFIGURED',
      ERROR_MESSAGES.SCREEN_API_NOT_CONFIGURED,
    )
  }
  if (!/^[a-z0-9-]+$/i.test(functionName)) {
    throw new WebScreenClientError(
      'SCREEN_API_NOT_CONFIGURED',
      'Tên Edge Function screen-api không hợp lệ.',
    )
  }

  let projectUrl: URL
  try {
    projectUrl = new URL(supabaseUrl)
  } catch (error) {
    throw new WebScreenClientError(
      'SCREEN_API_NOT_CONFIGURED',
      'VITE_SUPABASE_URL không phải URL hợp lệ.',
      { cause: error },
    )
  }
  if (projectUrl.protocol !== 'https:' && projectUrl.hostname !== 'localhost') {
    throw new WebScreenClientError(
      'SCREEN_API_NOT_CONFIGURED',
      'VITE_SUPABASE_URL phải dùng HTTPS, trừ Supabase chạy local.',
    )
  }

  return {
    endpoint: `${projectUrl.toString().replace(/\/+$/, '')}/functions/v1/${functionName}`,
    publicKey,
  }
}

export const isWebScreenClientConfigured = (): boolean => {
  try {
    clientConfig()
    return true
  } catch {
    return false
  }
}

const errorMessage = (code: string, serverMessage?: string | null) =>
  ERROR_MESSAGES[code] ?? serverMessage ?? `screen-api trả về lỗi ${code}.`

const responsePayload = async (response: Response): Promise<JsonRecord> => {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) throw invalidResponse('Phản hồi screen-api không phải JSON object.')
    return parsed
  } catch (error) {
    if (error instanceof WebScreenClientError) throw error
    throw invalidResponse('screen-api trả về nội dung không phải JSON hợp lệ.')
  }
}

const request = async (
  action: 'register' | 'status' | 'manifest' | 'heartbeat',
  body: JsonRecord,
  options: { deviceToken?: string | null; signal?: AbortSignal } = {},
): Promise<JsonRecord> => {
  const { endpoint, publicKey } = clientConfig()
  const authorization = options.deviceToken?.trim() || publicKey
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publicKey,
        Authorization: `Bearer ${authorization}`,
      },
      body: JSON.stringify({ action, ...body }),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new WebScreenClientError('REQUEST_ABORTED', ERROR_MESSAGES.REQUEST_ABORTED, {
        cause: error,
      })
    }
    throw new WebScreenClientError('NETWORK_ERROR', ERROR_MESSAGES.NETWORK_ERROR, {
      retriable: true,
      cause: error,
    })
  }

  const payload = await responsePayload(response)
  const responseCode = nullableString(payload.error)
  if (!response.ok || responseCode) {
    const code = responseCode ?? `HTTP_${response.status}`
    const serverMessage = nullableString(payload.message)
    throw new WebScreenClientError(code, errorMessage(code, serverMessage), {
      httpStatus: response.status,
      retriable: response.status === 408 || response.status === 429 || response.status >= 500,
      details: payload,
    })
  }
  return payload
}

const storedDeviceToken = (): string => {
  const token = getWebScreenCredentials().deviceToken
  if (!token) {
    throw new WebScreenClientError('DEVICE_TOKEN_MISSING', ERROR_MESSAGES.DEVICE_TOKEN_MISSING)
  }
  return token
}

const parseBranch = (value: unknown): WebScreenBranch | null => {
  if (!isRecord(value)) return null
  return {
    id: requiredString(value, 'id'),
    code: requiredString(value, 'code'),
    name: requiredString(value, 'name'),
    address: requiredString(value, 'address'),
  }
}

const parseScreen = (value: unknown): WebScreen | null => {
  if (!isRecord(value)) return null
  return {
    id: requiredString(value, 'id'),
    screenCode: requiredString(value, 'screen_code'),
    name: requiredString(value, 'name'),
    branchId: requiredString(value, 'branch_id'),
    branch: parseBranch(value.branch),
  }
}

export const registerWebScreen = async (
  options: RegisterWebScreenOptions = {},
): Promise<RegisterWebScreenResult> => {
  const credentials = getWebScreenCredentials()
  const payload = await request(
    'register',
    {
      deviceId: credentials.deviceId,
      deviceName: options.deviceName?.trim() || DEFAULT_DEVICE_NAME,
      deviceType: 'web',
      appVersion: options.appVersion?.trim() || DEFAULT_APP_VERSION,
    },
    { signal: options.signal },
  )

  const result: RegisterWebScreenResult = {
    registrationId: requiredString(payload, 'registrationId'),
    pairingCode: requiredString(payload, 'pairingCode'),
    deviceToken: requiredString(payload, 'deviceToken'),
    status: registrationState(payload.status),
    expiresAt: requiredString(payload, 'expiresAt'),
    deviceId: credentials.deviceId,
  }
  saveCredentials({
    deviceId: credentials.deviceId,
    deviceToken: result.deviceToken,
    pairingCode: result.pairingCode,
  })
  return result
}

export const getWebScreenStatus = async (
  signal?: AbortSignal,
): Promise<WebScreenStatusResult> => {
  const payload = await request('status', {}, { deviceToken: storedDeviceToken(), signal })
  return {
    status: registrationState(payload.status),
    screenId: nullableString(payload.screenId),
    screen: parseScreen(payload.screen),
    expiresAt: requiredString(payload, 'expiresAt'),
  }
}

export const getWebScreenManifest = async (
  signal?: AbortSignal,
): Promise<WebScreenManifestResult> => {
  const payload = await request('manifest', {}, { deviceToken: storedDeviceToken(), signal })
  const releaseValue = payload.release
  let release: WebScreenRelease | null = null

  if (releaseValue !== null && releaseValue !== undefined) {
    if (!isRecord(releaseValue) || !isRecord(releaseValue.manifest)) {
      throw invalidResponse('Release manifest không hợp lệ.', payload)
    }
    release = {
      id: requiredString(releaseValue, 'id'),
      releaseVersion: requiredString(releaseValue, 'release_version'),
      periodId: requiredString(releaseValue, 'period_id'),
      status: requiredString(releaseValue, 'status'),
      activateAt: nullableString(releaseValue.activate_at),
      manifest: releaseValue.manifest,
      updatedAt: requiredString(releaseValue, 'updated_at'),
    }
  }

  return {
    release,
    currentReleaseId: nullableString(payload.currentReleaseId),
    screenId: nullableString(payload.screenId),
    screen: parseScreen(payload.screen),
    serverTime: requiredString(payload, 'serverTime'),
  }
}

export const sendWebScreenHeartbeat = async (
  heartbeat: WebScreenHeartbeat = {},
): Promise<WebScreenHeartbeatResult> => {
  const {
    currentReleaseId = null,
    readyReleaseId = null,
    currentItemKey = null,
    lastError = null,
    appVersion = DEFAULT_APP_VERSION,
    cacheState = {},
    deviceInfo = {},
    signal,
  } = heartbeat
  const payload = await request(
    'heartbeat',
    {
      currentReleaseId,
      readyReleaseId,
      currentItemKey,
      lastError,
      appVersion,
      cacheState,
      deviceInfo,
    },
    { deviceToken: storedDeviceToken(), signal },
  )
  if (payload.ok !== true) throw invalidResponse('screen-api không xác nhận heartbeat.', payload)
  return {
    ok: true,
    serverTime: requiredString(payload, 'serverTime'),
  }
}

export const webScreenClient = {
  isConfigured: isWebScreenClientConfigured,
  credentials: getWebScreenCredentials,
  resetCredentials: resetWebScreenCredentials,
  register: registerWebScreen,
  status: getWebScreenStatus,
  manifest: getWebScreenManifest,
  heartbeat: sendWebScreenHeartbeat,
} as const
