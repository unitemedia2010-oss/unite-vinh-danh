package vn.unite.vinhdanh.tv.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ManifestJsonCodecTest {
    @Test
    fun decodesCamelCaseScreenApiManifest() {
        val release = ManifestJsonCodec.decode(
            """
            {
              "id": "release-live",
              "version": "2026.08.1",
              "branchId": "branch-tbt",
              "branchAddress": "125 Trần Bình Trọng",
              "effectiveAtEpochMs": 123456789,
              "items": [
                {
                  "key": "leader-board",
                  "type": "recognition",
                  "title": "Kỳ Lân",
                  "durationSeconds": 22,
                  "recognitionBoard": {
                    "periodLabel": "Tháng 08/2026",
                    "categoryLabel": "Từ 200 triệu",
                    "entries": [
                      {
                        "rank": 1,
                        "employeeId": "U001",
                        "name": "Nguyễn Minh Anh",
                        "role": "Leader",
                        "revenue": 256000000,
                        "avatarUrl": "https://example.test/avatar.png"
                      }
                    ]
                  }
                }
              ]
            }
            """.trimIndent()
        )

        assertTrue(release.isPlayable())
        assertEquals("release-live", release.id)
        assertEquals("2026.08.1", release.version)
        assertEquals("branch-tbt", release.branchId)
        assertEquals(1, release.playlist.size)
        assertEquals("leader-board", release.playlist.single().id)
        assertEquals(256_000_000L, release.playlist.single()
            .recognitionBoard?.entries?.single()?.revenue)
    }

    @Test
    fun roundTripsReadyReleaseWithoutLosingIdentity() {
        val original = MockReleaseFactory.create().copy(
            id = "release-ready",
            version = "2026.08.2",
            branchId = "branch-01",
            effectiveAtEpochMs = 1_800_000_000_000L
        )

        val decoded = ManifestJsonCodec.decode(ManifestJsonCodec.encode(original))

        assertEquals(original.id, decoded.id)
        assertEquals(original.version, decoded.version)
        assertEquals(original.branchId, decoded.branchId)
        assertEquals(original.effectiveAtEpochMs, decoded.effectiveAtEpochMs)
        assertEquals(original.playlist.size, decoded.playlist.size)
    }

    @Test
    fun decodesPublicVideoUrlFromWebReleaseManifest() {
        val publicUrl = "https://media.w3.org/2010/05/video/movie_300.mp4"
        val backgroundUrl = "https://example.test/background.png?token=signed"
        val logoUrl = "https://example.test/logo.png?token=signed"
        val thumbnailUrl = "https://example.test/thumbnail.jpg?token=signed"
        val release = ManifestJsonCodec.decode(
            """
            {
              "version": "DEMO-08-2026-R1",
              "playlist": [
                {
                  "id": "pl-10",
                  "type": "video",
                  "title": "UNITE WEEKLY",
                  "duration_seconds": 42,
                  "mediaUrl": "$publicUrl",
                  "media_url": "$publicUrl",
                  "backgroundUrl": "$backgroundUrl",
                  "logo_url": "$logoUrl",
                  "thumbnailUrl": "$thumbnailUrl"
                }
              ]
            }
            """.trimIndent()
        )

        assertEquals(PlaylistItemType.VIDEO, release.playlist.single().type)
        assertEquals(publicUrl, release.playlist.single().mediaUrl)
        assertEquals(backgroundUrl, release.playlist.single().backgroundUrl)
        assertEquals(logoUrl, release.playlist.single().logoUrl)
        assertEquals(thumbnailUrl, release.playlist.single().thumbnailUrl)

        val roundTripped = ManifestJsonCodec.decode(ManifestJsonCodec.encode(release))
        assertEquals(backgroundUrl, roundTripped.playlist.single().backgroundUrl)
        assertEquals(logoUrl, roundTripped.playlist.single().logoUrl)
        assertEquals(thumbnailUrl, roundTripped.playlist.single().thumbnailUrl)
    }
}
