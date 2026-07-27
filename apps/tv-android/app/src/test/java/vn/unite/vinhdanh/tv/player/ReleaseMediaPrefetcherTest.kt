package vn.unite.vinhdanh.tv.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import vn.unite.vinhdanh.tv.data.PlaylistItem
import vn.unite.vinhdanh.tv.data.PlaylistItemType
import vn.unite.vinhdanh.tv.data.RecognitionBoard
import vn.unite.vinhdanh.tv.data.RecognitionEntry
import vn.unite.vinhdanh.tv.data.ReleaseManifest

class ReleaseMediaPrefetcherTest {
    @Test
    fun plansAllSupportedAssetsAndDeduplicatesRefreshedSignedAvatars() {
        val release = release(
            PlaylistItem(
                id = "video",
                type = PlaylistItemType.VIDEO,
                title = "Weekly",
                durationSeconds = 30,
                mediaUrl = "https://cdn.test/video.mp4?token=one",
                mediaSha256 = "a".repeat(64),
                backgroundUrl = "https://cdn.test/background.png?token=one",
                logoUrl = "https://cdn.test/logo.png?token=one",
                thumbnailUrl = "https://cdn.test/thumb.jpg?token=one",
                recognitionBoard = RecognitionBoard(
                    periodLabel = "08/2026",
                    categoryLabel = "Top",
                    entries = listOf(
                        entry("https://cdn.test/avatar/u1.png?token=one"),
                        entry("https://cdn.test/avatar/u1.png?token=two")
                    )
                )
            )
        )

        val plan = ReleaseMediaPlanner.plan(release)

        assertEquals(0, plan.missingRequiredAssets)
        assertEquals(5, plan.assets.size)
        assertEquals(
            setOf(
                ReleaseAssetKind.MEDIA,
                ReleaseAssetKind.BACKGROUND,
                ReleaseAssetKind.LOGO,
                ReleaseAssetKind.THUMBNAIL,
                ReleaseAssetKind.AVATAR
            ),
            plan.assets.map { it.kind }.toSet()
        )
        assertTrue(plan.assets.single { it.kind == ReleaseAssetKind.MEDIA }.required)
    }

    @Test
    fun optionalAvatarFailureDoesNotBlockCachedRequiredVideo() {
        val release = release(
            PlaylistItem(
                id = "video",
                type = PlaylistItemType.VIDEO,
                title = "Weekly",
                durationSeconds = 30,
                mediaUrl = "https://cdn.test/video.mp4",
                recognitionBoard = RecognitionBoard(
                    "08/2026",
                    "Top",
                    listOf(entry("https://cdn.test/avatar/u1.png"))
                )
            )
        )
        var result: ReleasePrefetchResult? = null
        ReleaseMediaPrefetcher(
            ReleaseAssetLoader { asset, callback ->
                callback(asset.kind != ReleaseAssetKind.AVATAR)
            }
        ).prefetch(release) { result = it }

        assertNotNull(result)
        assertEquals(2, result?.requested)
        assertEquals(1, result?.cached)
        assertEquals(1, result?.failed)
        assertEquals(0, result?.requiredFailures)
        assertTrue(result?.canActivate == true)
    }

    @Test
    fun missingOrFailedRequiredVideoBlocksActivationAndCompletesOnce() {
        var missingResult: ReleasePrefetchResult? = null
        ReleaseMediaPrefetcher(ReleaseAssetLoader { _, callback -> callback(true) })
            .prefetch(
                release(
                    PlaylistItem(
                        id = "missing-video",
                        type = PlaylistItemType.VIDEO,
                        title = "Missing",
                        durationSeconds = 30
                    )
                )
            ) { missingResult = it }

        assertEquals(1, missingResult?.requiredFailures)
        assertFalse(missingResult?.canActivate ?: true)

        var completionCount = 0
        var failedResult: ReleasePrefetchResult? = null
        ReleaseMediaPrefetcher(
            ReleaseAssetLoader { _, callback ->
                callback(false)
                callback(false)
            }
        ).prefetch(
            release(
                PlaylistItem(
                    id = "failed-video",
                    type = PlaylistItemType.VIDEO,
                    title = "Failed",
                    durationSeconds = 30,
                    mediaUrl = "https://cdn.test/fail.mp4"
                )
            )
        ) {
            completionCount += 1
            failedResult = it
        }

        assertEquals(1, completionCount)
        assertEquals(1, failedResult?.requiredFailures)
        assertFalse(failedResult?.canActivate ?: true)
    }

    private fun entry(url: String) = RecognitionEntry(
        rank = 1,
        employeeId = "U1",
        name = "Nguyễn Minh Anh",
        role = "Leader",
        revenue = 156_000_000,
        avatarUrl = url
    )

    private fun release(vararg items: PlaylistItem) = ReleaseManifest(
        id = "de080000-2026-4000-8000-000000000099",
        version = "test",
        branchId = "branch-1",
        branchAddress = "125 Trần Bình Trọng",
        effectiveAtEpochMs = Long.MAX_VALUE,
        playlist = items.toList()
    )
}
