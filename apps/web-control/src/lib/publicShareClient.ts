import type { WebScreenRelease } from './webScreenClient'

type JsonRecord = Record<string, unknown>

export interface PublicShareManifestResult {
  release: WebScreenRelease | null
  serverTime: string
  fromCache: boolean
}

export class PublicShareClientError extends Error {
  readonly code: string

  constructor(code: string, message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'PublicShareClientError'
    this.code = code
  }
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const requireString = (record: JsonRecord, key: string) => {
  const value = stringValue(record[key])
  if (!value) throw new PublicShareClientError('INVALID_RESPONSE', `Phản hồi thiếu trường ${key}.`)
  return value
}

let cachedResult: PublicShareManifestResult | null = null
let cachedEtag = ''

const clientConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  const functionName = import.meta.env.VITE_SCREEN_API_FUNCTION?.trim() || 'screen-api'

  if (!supabaseUrl || !publicKey) {
    throw new PublicShareClientError(
      'NOT_CONFIGURED',
      'Trang chia sẻ chưa được cấu hình kết nối dữ liệu.',
    )
  }

  let projectUrl: URL
  try {
    projectUrl = new URL(supabaseUrl)
  } catch (error) {
    throw new PublicShareClientError('NOT_CONFIGURED', 'Địa chỉ máy chủ dữ liệu không hợp lệ.', { cause: error })
  }

  if (projectUrl.protocol !== 'https:' && projectUrl.hostname !== 'localhost') {
    throw new PublicShareClientError('NOT_CONFIGURED', 'Trang chia sẻ yêu cầu kết nối HTTPS.')
  }

  return {
    endpoint: `${projectUrl.toString().replace(/\/+$/, '')}/functions/v1/${functionName}`,
    publicKey,
  }
}

const responsePayload = async (response: Response): Promise<JsonRecord> => {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) throw new Error('not an object')
    return parsed
  } catch (error) {
    throw new PublicShareClientError('INVALID_RESPONSE', 'Máy chủ trả về dữ liệu không hợp lệ.', { cause: error })
  }
}

export const getPublicShareManifest = async (
  signal?: AbortSignal,
): Promise<PublicShareManifestResult> => {
  const { endpoint, publicKey } = clientConfig()
  let response: Response

  try {
    const url = new URL(endpoint)
    url.searchParams.set('action', 'public_manifest')
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${publicKey}`,
        ...(cachedEtag ? { 'If-None-Match': cachedEtag } : {}),
      },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (cachedResult) return { ...cachedResult, fromCache: true }
    throw new PublicShareClientError(
      'NETWORK_ERROR',
      'Không thể tải bản vinh danh. Vui lòng kiểm tra mạng và thử lại.',
      { cause: error },
    )
  }

  if (response.status === 304 && cachedResult) {
    return { ...cachedResult, fromCache: true }
  }

  if (response.status === 429 && cachedResult) {
    return { ...cachedResult, fromCache: true }
  }

  if (response.status >= 500 && cachedResult) {
    return { ...cachedResult, fromCache: true }
  }

  const payload = await responsePayload(response)
  if (!response.ok || stringValue(payload.error)) {
    const code = stringValue(payload.error) || `HTTP_${response.status}`
    const serverMessage = stringValue(payload.message)
    throw new PublicShareClientError(
      code,
      serverMessage || (code === 'UNKNOWN_ACTION'
        ? 'Trang chia sẻ đang chờ máy chủ được cập nhật.'
        : 'Chưa thể tải bản vinh danh đã phát hành.'),
    )
  }

  const serverTime = stringValue(payload.serverTime) || new Date().toISOString()
  if (payload.release === null || payload.release === undefined) {
    cachedEtag = response.headers.get('etag') || ''
    cachedResult = { release: null, serverTime, fromCache: false }
    return cachedResult
  }
  if (!isRecord(payload.release) || !isRecord(payload.release.manifest)) {
    throw new PublicShareClientError('INVALID_RESPONSE', 'Bản phát hành không đúng định dạng.')
  }

  const releaseVersion = stringValue(payload.release.releaseVersion)
    || stringValue(payload.release.release_version)
  const periodId = stringValue(payload.release.periodId)
    || stringValue(payload.release.period_id)
  const activateAt = stringValue(payload.release.activateAt)
    || stringValue(payload.release.activate_at)
  const publishedAt = stringValue(payload.release.publishedAt)
    || stringValue(payload.release.published_at)
  const updatedAt = stringValue(payload.release.updatedAt)
    || stringValue(payload.release.updated_at)
    || publishedAt
    || serverTime
  if (!releaseVersion || !periodId) {
    throw new PublicShareClientError('INVALID_RESPONSE', 'Bản phát hành thiếu phiên bản hoặc kỳ dữ liệu.')
  }

  const result: PublicShareManifestResult = {
    release: {
      id: requireString(payload.release, 'id'),
      releaseVersion,
      periodId,
      status: stringValue(payload.release.status) || 'published',
      activateAt,
      manifest: payload.release.manifest,
      updatedAt,
    },
    serverTime,
    fromCache: false,
  }
  cachedEtag = response.headers.get('etag') || ''
  cachedResult = result
  return result
}
