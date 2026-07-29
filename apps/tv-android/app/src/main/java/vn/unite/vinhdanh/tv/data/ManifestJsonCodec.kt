package vn.unite.vinhdanh.tv.data

import org.json.JSONArray
import org.json.JSONObject

object ManifestJsonCodec {
    fun encode(release: ReleaseManifest): String {
        val root = JSONObject()
            .put("id", release.id)
            .put("version", release.version)
            .put("branch_id", release.branchId)
            .put("branch_address", release.branchAddress)
            .put("effective_at_epoch_ms", release.effectiveAtEpochMs)

        val playlist = JSONArray()
        release.playlist.forEach { item ->
            val json = JSONObject()
                .put("id", item.id)
                .put("type", item.type.wireValue)
                .put("title", item.title)
                .put("duration_seconds", item.durationSeconds)

            item.mediaUrl?.let { json.put("media_url", it) }
            item.mediaSha256?.let { json.put("media_sha256", it) }
            item.backgroundUrl?.let { json.put("background_url", it) }
            item.backgroundSha256?.let { json.put("background_sha256", it) }
            item.logoUrl?.let { json.put("logo_url", it) }
            item.logoSha256?.let { json.put("logo_sha256", it) }
            item.thumbnailUrl?.let { json.put("thumbnail_url", it) }
            item.thumbnailSha256?.let { json.put("thumbnail_sha256", it) }
            item.announcementBody?.let { json.put("announcement_body", it) }
            item.recognitionBoard?.let { board ->
                val boardJson = JSONObject()
                    .put("period_label", board.periodLabel)
                    .put("category_label", board.categoryLabel)
                val entries = JSONArray()
                board.entries.forEach { entry ->
                    entries.put(
                        JSONObject()
                            .put("rank", entry.rank)
                            .put("employee_id", entry.employeeId)
                            .put("name", entry.name)
                            .put("role", entry.role)
                            .put("revenue", entry.revenue)
                            .also { entryJson ->
                                entry.avatarUrl?.let { entryJson.put("avatar_url", it) }
                            }
                    )
                }
                boardJson.put("entries", entries)
                json.put("recognition_board", boardJson)
            }
            playlist.put(json)
        }
        root.put("playlist", playlist)
        return root.toString()
    }

    fun decode(raw: String): ReleaseManifest {
        val root = JSONObject(raw)
        val playlistJson = root.optJSONArray("playlist")
            ?: root.optJSONArray("items")
            ?: JSONArray()
        val playlist = buildList {
            for (index in 0 until playlistJson.length()) {
                val itemJson = playlistJson.getJSONObject(index)
                val board = (itemJson.optJSONObject("recognition_board")
                    ?: itemJson.optJSONObject("recognitionBoard"))?.let(::decodeBoard)
                add(
                    PlaylistItem(
                        id = itemJson.firstString("id", "key").ifBlank { "item-$index" },
                        type = PlaylistItemType.fromWire(
                            itemJson.firstString("type", "kind").ifBlank { "announcement" }
                        ),
                        title = itemJson.firstString("title", "name"),
                        durationSeconds = itemJson.firstInt(
                            20,
                            "duration_seconds",
                            "durationSeconds",
                            "duration"
                        ).coerceAtLeast(3),
                        mediaUrl = itemJson.firstString("media_url", "mediaUrl")
                            .takeIf(String::isNotBlank),
                        mediaSha256 = itemJson.firstString("media_sha256", "mediaSha256")
                            .takeIf(String::isNotBlank),
                        backgroundUrl = itemJson.firstString("background_url", "backgroundUrl")
                            .takeIf(String::isNotBlank),
                        backgroundSha256 = itemJson.firstString(
                            "background_sha256",
                            "backgroundSha256"
                        ).takeIf(String::isNotBlank),
                        logoUrl = itemJson.firstString("logo_url", "logoUrl")
                            .takeIf(String::isNotBlank),
                        logoSha256 = itemJson.firstString("logo_sha256", "logoSha256")
                            .takeIf(String::isNotBlank),
                        thumbnailUrl = itemJson.firstString("thumbnail_url", "thumbnailUrl")
                            .takeIf(String::isNotBlank),
                        thumbnailSha256 = itemJson.firstString(
                            "thumbnail_sha256",
                            "thumbnailSha256"
                        ).takeIf(String::isNotBlank),
                        announcementBody = itemJson.firstString(
                            "announcement_body",
                            "announcementBody",
                            "body"
                        ).takeIf(String::isNotBlank),
                        recognitionBoard = board
                    )
                )
            }
        }

        return ReleaseManifest(
            id = root.firstString("id", "releaseId"),
            version = root.firstString("version", "releaseVersion").ifBlank { "1" },
            branchId = root.firstString("branch_id", "branchId"),
            branchAddress = root.firstString("branch_address", "branchAddress")
                .ifBlank { "Chưa cập nhật địa chỉ chi nhánh" },
            effectiveAtEpochMs = root.firstLong(
                0L,
                "effective_at_epoch_ms",
                "effectiveAtEpochMs"
            ),
            playlist = playlist
        )
    }

    private fun decodeBoard(json: JSONObject): RecognitionBoard {
        val entriesJson = json.optJSONArray("entries")
            ?: json.optJSONArray("rankings")
            ?: JSONArray()
        val entries = buildList {
            for (index in 0 until entriesJson.length()) {
                val entry = entriesJson.getJSONObject(index)
                add(
                    RecognitionEntry(
                        rank = entry.firstInt(index + 1, "rank", "position"),
                        employeeId = entry.firstString("employee_id", "employeeId", "id"),
                        name = entry.firstString("name", "employeeName"),
                        role = entry.firstString("role", "positionName"),
                        revenue = entry.firstLong(0L, "revenue", "amount", "sales"),
                        avatarUrl = entry.firstString("avatar_url", "avatarUrl", "photoUrl")
                            .takeIf(String::isNotBlank)
                    )
                )
            }
        }
        return RecognitionBoard(
            periodLabel = json.firstString("period_label", "periodLabel"),
            categoryLabel = json.firstString("category_label", "categoryLabel"),
            entries = entries.sortedBy(RecognitionEntry::rank)
        )
    }

    private fun JSONObject.firstString(vararg keys: String): String {
        for (key in keys) {
            if (!has(key) || isNull(key)) continue
            val value = optString(key)
            if (value.isNotBlank()) return value
        }
        return ""
    }

    private fun JSONObject.firstInt(defaultValue: Int, vararg keys: String): Int {
        for (key in keys) {
            if (has(key) && !isNull(key)) return optInt(key, defaultValue)
        }
        return defaultValue
    }

    private fun JSONObject.firstLong(defaultValue: Long, vararg keys: String): Long {
        for (key in keys) {
            if (has(key) && !isNull(key)) return optLong(key, defaultValue)
        }
        return defaultValue
    }
}
