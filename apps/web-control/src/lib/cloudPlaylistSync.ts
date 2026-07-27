import type { PlaylistConfig, PlaylistDraftItem } from '../types'
import { loadMediaAsset } from './mediaStore'
import {
  SupabasePlaylistError,
  createPlaylistMediaSignedUrl,
  deletePlaylistMedia,
  listSupabasePlaylists,
  loadPlaylistFromSupabase,
  savePlaylistToSupabase,
  uploadPlaylistMedia,
  type SupabasePlaylistSnapshot,
  type SupabaseSlideMediaBindings,
} from './supabasePlaylistRepository'

const CLOUD_STATE_KEY = 'unite-recognition-cloud-playlist-v1'

type CachedSlideMedia = SupabaseSlideMediaBindings & {
  backgroundAssetId?: string
  logoAssetId?: string
  mediaAssetId?: string
}

type CloudPlaylistState = {
  version: 1
  playlistId: string
  mediaBySlideId: Record<string, CachedSlideMedia>
}

export type CloudPlaylistSaveResult = {
  snapshot: SupabasePlaylistSnapshot
  uploadedAssets: number
}

const readCloudState = (): CloudPlaylistState | null => {
  try {
    const raw = window.localStorage.getItem(CLOUD_STATE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<CloudPlaylistState>
    if (value.version !== 1 || typeof value.playlistId !== 'string' || !value.mediaBySlideId) return null
    return value as CloudPlaylistState
  } catch {
    return null
  }
}

const writeCloudState = (state: CloudPlaylistState) => {
  window.localStorage.setItem(CLOUD_STATE_KEY, JSON.stringify(state))
}

const stateFromSnapshot = (snapshot: SupabasePlaylistSnapshot): CloudPlaylistState => ({
  version: 1,
  playlistId: snapshot.id,
  mediaBySlideId: Object.fromEntries(
    snapshot.slides.map((entry) => [
      entry.slide.id,
      {
        ...entry.media,
        backgroundAssetId: entry.slide.backgroundAssetId,
        logoAssetId: entry.slide.logoAssetId,
        mediaAssetId: entry.slide.mediaAssetId,
      },
    ]),
  ),
})

const signedUrl = async (path?: string) =>
  path ? createPlaylistMediaSignedUrl(path, 60 * 60 * 8) : undefined

const hydrateSignedUrls = async (snapshot: SupabasePlaylistSnapshot): Promise<SupabasePlaylistSnapshot> => {
  const items = await Promise.all(snapshot.slides.map(async (entry) => {
    const [backgroundUrl, logoUrl, mediaUrl] = await Promise.all([
      signedUrl(entry.media.backgroundPath),
      signedUrl(entry.media.logoPath),
      signedUrl(entry.media.mediaPath),
    ])
    return {
      ...entry.slide,
      backgroundUrl: backgroundUrl ?? entry.slide.backgroundUrl,
      logoUrl: logoUrl ?? entry.slide.logoUrl,
      mediaUrl: mediaUrl ?? entry.slide.mediaUrl,
    }
  }))
  return {
    ...snapshot,
    config: {
      ...snapshot.config,
      items,
    },
    slides: snapshot.slides.map((entry, index) => ({
      ...entry,
      slide: items[index],
    })),
  }
}

export const currentCloudPlaylistId = () => readCloudState()?.playlistId ?? null

export const loadCloudPlaylistDraft = async (
  expectedName: string,
): Promise<SupabasePlaylistSnapshot | null> => {
  const cached = readCloudState()
  let snapshot: SupabasePlaylistSnapshot | null = null

  if (cached?.playlistId) {
    try {
      snapshot = await loadPlaylistFromSupabase(cached.playlistId)
    } catch (error) {
      if (!(error instanceof SupabasePlaylistError) || error.code !== 'NOT_FOUND') throw error
      window.localStorage.removeItem(CLOUD_STATE_KEY)
    }
  }

  if (!snapshot) {
    const canonicalName = expectedName.trim().replace(/\s+/g, ' ')
    const matches = (await listSupabasePlaylists())
      .filter((item) => item.status === 'draft' && item.name === canonicalName)
    if (matches.length > 1) {
      throw new SupabasePlaylistError(
        'INVALID_INPUT',
        `Có ${matches.length} bản nháp cùng tên “${canonicalName}”. Hãy xử lý bản trùng trước khi tải.`,
      )
    }
    if (!matches.length) return null
    snapshot = await loadPlaylistFromSupabase(matches[0].id)
  }

  writeCloudState(stateFromSnapshot(snapshot))
  return hydrateSignedUrls(snapshot)
}

const configWithoutTemporarySignedUrls = (
  config: PlaylistConfig,
  mediaBySlideId: Readonly<Record<string, SupabaseSlideMediaBindings>>,
): PlaylistConfig => ({
  ...config,
  items: config.items.map((slide) => {
    const media = mediaBySlideId[slide.id]
    return {
      ...slide,
      backgroundUrl: media?.backgroundPath ? undefined : slide.backgroundUrl,
      logoUrl: media?.logoPath ? undefined : slide.logoUrl,
      mediaUrl: media?.mediaPath ? '' : slide.mediaUrl,
    }
  }),
})

export const saveCloudPlaylistDraft = async (
  config: PlaylistConfig,
): Promise<CloudPlaylistSaveResult> => {
  const cached = readCloudState()
  const safeInitialConfig = configWithoutTemporarySignedUrls(
    config,
    cached?.mediaBySlideId ?? {},
  )
  const firstSave = await savePlaylistToSupabase(safeInitialConfig, {
    playlistId: cached?.playlistId,
    status: 'draft',
    mediaBySlideId: cached?.mediaBySlideId,
  })
  const playlistId = firstSave.id
  const nextMedia: Record<string, CachedSlideMedia> = {}
  const replacedPaths: string[] = []
  let uploadedAssets = 0

  const uploadAsset = async (
    slide: PlaylistDraftItem,
    purpose: 'background' | 'logo' | 'media',
    assetId: string | undefined,
    previousAssetId: string | undefined,
    previousPath: string | undefined,
  ) => {
    if (!assetId) {
      if (previousPath) replacedPaths.push(previousPath)
      return undefined
    }
    if (assetId === previousAssetId && previousPath) return previousPath
    const asset = await loadMediaAsset(assetId)
    if (!asset) {
      throw new SupabasePlaylistError(
        'INVALID_INPUT',
        `Không tìm thấy file cục bộ “${slide.title}” (${purpose}). Hãy tải lại file trước khi lưu Cloud.`,
      )
    }
    const uploaded = await uploadPlaylistMedia({
      playlistId,
      slideId: slide.id,
      purpose,
      data: asset.blob,
      fileName: asset.name,
      contentType: asset.type,
    })
    uploadedAssets += 1
    if (previousPath && previousPath !== uploaded.path) replacedPaths.push(previousPath)
    return uploaded.path
  }

  for (const slide of config.items) {
    const previous = cached?.mediaBySlideId[slide.id] ?? {}
    const backgroundPath = await uploadAsset(
      slide,
      'background',
      slide.backgroundAssetId,
      previous.backgroundAssetId,
      previous.backgroundPath,
    )
    const logoPath = await uploadAsset(
      slide,
      'logo',
      slide.logoAssetId,
      previous.logoAssetId,
      previous.logoPath,
    )
    const mediaPath = await uploadAsset(
      slide,
      'media',
      slide.mediaAssetId,
      previous.mediaAssetId,
      previous.mediaPath,
    )
    nextMedia[slide.id] = {
      backgroundAssetId: slide.backgroundAssetId,
      logoAssetId: slide.logoAssetId,
      mediaAssetId: slide.mediaAssetId,
      backgroundPath,
      logoPath,
      mediaPath,
      thumbnailPath: previous.thumbnailPath,
    }
  }
  const activeSlideIds = new Set(config.items.map((slide) => slide.id))
  for (const [slideId, media] of Object.entries(cached?.mediaBySlideId ?? {})) {
    if (activeSlideIds.has(slideId)) continue
    replacedPaths.push(
      ...[media.backgroundPath, media.logoPath, media.mediaPath, media.thumbnailPath].filter(
        (path): path is string => Boolean(path),
      ),
    )
  }

  const persistedConfig = configWithoutTemporarySignedUrls(config, nextMedia)
  const snapshot = await savePlaylistToSupabase(persistedConfig, {
    playlistId,
    status: 'draft',
    mediaBySlideId: nextMedia,
  })
  writeCloudState({
    version: 1,
    playlistId,
    mediaBySlideId: nextMedia,
  })

  if (replacedPaths.length) {
    void deletePlaylistMedia(replacedPaths).catch(() => {
      // Draft data is already safe; orphan cleanup can be retried later.
    })
  }
  return { snapshot, uploadedAssets }
}
