package vn.unite.vinhdanh.tv.data

import android.content.Context
import android.util.Log
import java.io.File

class ReleaseCache(context: Context) {
    private val releaseDir = File(context.filesDir, "releases").apply { mkdirs() }
    private val currentFile = File(releaseDir, "last_known_release.json")
    private val readyFile = File(releaseDir, "ready_release.json")

    fun loadCurrent(): ReleaseManifest? = load(currentFile)

    fun loadReady(): ReleaseManifest? = load(readyFile)

    fun saveCurrent(release: ReleaseManifest): Boolean = save(currentFile, release)

    fun saveReady(release: ReleaseManifest): Boolean = save(readyFile, release)

    fun clearCurrent(): Boolean = !currentFile.exists() || currentFile.delete()

    fun clearReady(): Boolean = !readyFile.exists() || readyFile.delete()

    private fun load(file: File): ReleaseManifest? = try {
        if (!file.isFile) null
        else ManifestJsonCodec.decode(file.readText(Charsets.UTF_8)).takeIf { it.isPlayable() }
    } catch (error: Exception) {
        Log.e(TAG, "Ignoring invalid cached release ${file.name}", error)
        null
    }

    private fun save(destination: File, release: ReleaseManifest): Boolean {
        if (!release.isPlayable()) return false
        return try {
            val temp = File(releaseDir, destination.name + ".tmp")
            temp.writeText(ManifestJsonCodec.encode(release), Charsets.UTF_8)
            if (destination.exists() && !destination.delete()) {
                Log.w(TAG, "Could not delete previous cached release ${destination.name}")
            }
            if (!temp.renameTo(destination)) {
                temp.copyTo(destination, overwrite = true)
                temp.delete()
            }
            true
        } catch (error: Exception) {
            Log.e(TAG, "Could not cache release ${destination.name}", error)
            false
        }
    }

    private companion object {
        const val TAG = "ReleaseCache"
    }
}
