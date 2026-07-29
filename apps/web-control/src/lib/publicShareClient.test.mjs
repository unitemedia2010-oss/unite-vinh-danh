import test from 'node:test'
import assert from 'node:assert/strict'
import { stabilizeManifestAssetUrls } from './publicShareClient.ts'

const manifestWithAvatar = (photoPath, avatarUrl) => {
  const entry = { avatar_url: avatarUrl }
  if (photoPath) entry.photo_path = photoPath
  return {
    playlist: [{
      recognition_board: {
        entries: [entry],
      },
    }],
  }
}

test('keeps one signed avatar URL while the stable photo path is unchanged', () => {
  const cache = new Map()
  const first = manifestWithAvatar(
    null,
    'https://signed.example/object/sign/employee-photos/avatars/u177-v1.webp?token=first',
  )
  stabilizeManifestAssetUrls(first, cache, 1_000)

  const refreshed = manifestWithAvatar(
    null,
    'https://signed.example/object/sign/employee-photos/avatars/u177-v1.webp?token=refreshed',
  )
  stabilizeManifestAssetUrls(refreshed, cache, 2_000)
  assert.equal(
    refreshed.playlist[0].recognition_board.entries[0].avatar_url,
    'https://signed.example/object/sign/employee-photos/avatars/u177-v1.webp?token=first',
  )
})

test('uses a new signed avatar URL after the photo path changes', () => {
  const cache = new Map()
  stabilizeManifestAssetUrls(
    manifestWithAvatar(null, 'https://signed.example/object/sign/employee-photos/avatars/u177-v1.webp?token=first'),
    cache,
    1_000,
  )
  const changed = manifestWithAvatar(
    null,
    'https://signed.example/object/sign/employee-photos/avatars/u177-v2.webp?token=second',
  )
  stabilizeManifestAssetUrls(changed, cache, 2_000)
  assert.equal(
    changed.playlist[0].recognition_board.entries[0].avatar_url,
    'https://signed.example/object/sign/employee-photos/avatars/u177-v2.webp?token=second',
  )
})

test('refreshes a signed avatar URL shortly before the old signature expires', () => {
  const cache = new Map()
  stabilizeManifestAssetUrls(
    manifestWithAvatar(null, 'https://signed.example/object/sign/employee-photos/avatars/u177-v1.webp?token=first'),
    cache,
    1_000,
  )
  const refreshed = manifestWithAvatar(
    null,
    'https://signed.example/object/sign/employee-photos/avatars/u177-v1.webp?token=second',
  )
  stabilizeManifestAssetUrls(refreshed, cache, 23 * 60 * 60 * 1000 + 1_001)
  assert.equal(
    refreshed.playlist[0].recognition_board.entries[0].avatar_url,
    'https://signed.example/object/sign/employee-photos/avatars/u177-v1.webp?token=second',
  )
})
