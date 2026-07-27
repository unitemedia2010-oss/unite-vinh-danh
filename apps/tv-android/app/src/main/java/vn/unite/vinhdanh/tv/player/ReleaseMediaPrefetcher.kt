package vn.unite.vinhdanh.tv.player

import vn.unite.vinhdanh.tv.data.PlaylistItemType
import vn.unite.vinhdanh.tv.data.ReleaseManifest
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

enum class ReleaseAssetKind {
    MEDIA,
    BACKGROUND,
    LOGO,
    THUMBNAIL,
    AVATAR
}

data class ReleaseMediaAsset(
    val kind: ReleaseAssetKind,
    val url: String,
    val sha256: String? = null,
    val required: Boolean = false
)

data class ReleaseMediaPlan(
    val assets: List<ReleaseMediaAsset>,
    val missingRequiredAssets: Int
)

data class ReleasePrefetchResult(
    val requested: Int,
    val cached: Int,
    val failed: Int,
    val requiredFailures: Int
) {
    val canActivate: Boolean
        get() = requiredFailures == 0
}

fun interface ReleaseAssetLoader {
    fun load(asset: ReleaseMediaAsset, callback: (Boolean) -> Unit)
}

/**
 * Extracts every remotely hosted asset understood by the Android player.
 * Signed URL query strings are ignored for de-duplication so refreshed
 * Supabase signatures still address the same cached object.
 */
object ReleaseMediaPlanner {
    fun plan(release: ReleaseManifest): ReleaseMediaPlan {
        val assets = mutableListOf<ReleaseMediaAsset>()
        var missingRequiredAssets = 0

        release.playlist.forEach { item ->
            val mediaRequired = item.type == PlaylistItemType.VIDEO
            if (item.mediaUrl.isNullOrBlank()) {
                if (mediaRequired) missingRequiredAssets += 1
            } else {
                assets += ReleaseMediaAsset(
                    kind = ReleaseAssetKind.MEDIA,
                    url = item.mediaUrl,
                    sha256 = item.mediaSha256,
                    required = mediaRequired
                )
            }
            item.backgroundUrl?.takeIf(String::isNotBlank)?.let { url ->
                assets += ReleaseMediaAsset(
                    ReleaseAssetKind.BACKGROUND,
                    url,
                    item.backgroundSha256
                )
            }
            item.logoUrl?.takeIf(String::isNotBlank)?.let { url ->
                assets += ReleaseMediaAsset(ReleaseAssetKind.LOGO, url, item.logoSha256)
            }
            item.thumbnailUrl?.takeIf(String::isNotBlank)?.let { url ->
                assets += ReleaseMediaAsset(
                    ReleaseAssetKind.THUMBNAIL,
                    url,
                    item.thumbnailSha256
                )
            }
            item.recognitionBoard?.entries.orEmpty().forEach { entry ->
                entry.avatarUrl?.takeIf(String::isNotBlank)?.let { url ->
                    assets += ReleaseMediaAsset(ReleaseAssetKind.AVATAR, url)
                }
            }
        }

        return ReleaseMediaPlan(
            assets = assets.distinctBy { asset ->
                "${asset.kind}:${asset.required}:${stableAssetIdentity(asset.url)}"
            },
            missingRequiredAssets = missingRequiredAssets
        )
    }

    internal fun stableAssetIdentity(rawUrl: String): String = runCatching {
        val parsed = URI(rawUrl)
        URI(
            parsed.scheme,
            parsed.authority,
            parsed.path,
            null,
            null
        ).toString()
    }.getOrDefault(rawUrl.substringBefore('?').substringBefore('#'))
}

/**
 * Runs a release plan through injected disk-cache loaders. Completion is
 * exactly-once even if a loader invokes its callback more than once.
 */
class ReleaseMediaPrefetcher(
    private val loader: ReleaseAssetLoader
) {
    fun prefetch(release: ReleaseManifest, completion: (ReleasePrefetchResult) -> Unit) {
        prefetch(ReleaseMediaPlanner.plan(release), completion)
    }

    internal fun prefetch(
        plan: ReleaseMediaPlan,
        completion: (ReleasePrefetchResult) -> Unit
    ) {
        val requested = plan.assets.size + plan.missingRequiredAssets
        if (plan.assets.isEmpty()) {
            completion(
                ReleasePrefetchResult(
                    requested = requested,
                    cached = 0,
                    failed = plan.missingRequiredAssets,
                    requiredFailures = plan.missingRequiredAssets
                )
            )
            return
        }

        val remaining = AtomicInteger(plan.assets.size)
        val cached = AtomicInteger(0)
        val failed = AtomicInteger(plan.missingRequiredAssets)
        val requiredFailures = AtomicInteger(plan.missingRequiredAssets)

        plan.assets.forEach { asset ->
            val callbackUsed = AtomicBoolean(false)
            val callback: (Boolean) -> Unit = callback@{ success ->
                if (!callbackUsed.compareAndSet(false, true)) return@callback
                if (success) {
                    cached.incrementAndGet()
                } else {
                    failed.incrementAndGet()
                    if (asset.required) requiredFailures.incrementAndGet()
                }
                if (remaining.decrementAndGet() == 0) {
                    completion(
                        ReleasePrefetchResult(
                            requested = requested,
                            cached = cached.get(),
                            failed = failed.get(),
                            requiredFailures = requiredFailures.get()
                        )
                    )
                }
            }
            try {
                loader.load(asset, callback)
            } catch (_: Exception) {
                callback(false)
            }
        }
    }
}
