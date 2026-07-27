package vn.unite.vinhdanh.tv.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class DeviceConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getOrCreateDeviceId(): String {
        val existing = prefs.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing
        return UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_DEVICE_ID, it).apply()
        }
    }

    fun savePendingPairing(pending: PendingPairing) {
        prefs.edit()
            .putString(KEY_PENDING_PAIRING_CODE, pending.pairingCode)
            .putString(KEY_PENDING_DEVICE_TOKEN, encrypt(pending.deviceToken))
            .putString(KEY_PENDING_STATUS, pending.status)
            .putLong(KEY_PENDING_EXPIRES_AT, pending.expiresAtEpochMs)
            .apply()
    }

    fun readPendingPairing(): PendingPairing? {
        val code = prefs.getString(KEY_PENDING_PAIRING_CODE, null) ?: return null
        val encryptedToken = prefs.getString(KEY_PENDING_DEVICE_TOKEN, null) ?: return null
        return try {
            PendingPairing(
                pairingCode = code,
                deviceToken = decrypt(encryptedToken),
                status = prefs.getString(KEY_PENDING_STATUS, "pending") ?: "pending",
                expiresAtEpochMs = prefs.getLong(KEY_PENDING_EXPIRES_AT, 0L)
            )
        } catch (error: Exception) {
            Log.e(TAG, "Cannot decrypt pending device token", error)
            clearPendingPairing()
            null
        }
    }

    fun clearPendingPairing() {
        prefs.edit()
            .remove(KEY_PENDING_PAIRING_CODE)
            .remove(KEY_PENDING_DEVICE_TOKEN)
            .remove(KEY_PENDING_STATUS)
            .remove(KEY_PENDING_EXPIRES_AT)
            .apply()
    }

    fun savePairedConfig(config: DeviceConfig) {
        val encryptedToken = encrypt(config.deviceToken)
        prefs.edit()
            .putString(KEY_DEVICE_ID, config.deviceId)
            .putString(KEY_DEVICE_TOKEN, encryptedToken)
            .putString(KEY_SCREEN_ID, config.screenId)
            .putString(KEY_BRANCH_ID, config.branchId)
            .putString(KEY_BRANCH_ADDRESS, config.branchAddress)
            .remove(KEY_PENDING_PAIRING_CODE)
            .remove(KEY_PENDING_DEVICE_TOKEN)
            .remove(KEY_PENDING_STATUS)
            .remove(KEY_PENDING_EXPIRES_AT)
            .apply()
    }

    fun readPairedConfig(): DeviceConfig? {
        val encryptedToken = prefs.getString(KEY_DEVICE_TOKEN, null) ?: return null
        val branchId = prefs.getString(KEY_BRANCH_ID, null) ?: return null
        val branchAddress = prefs.getString(KEY_BRANCH_ADDRESS, null) ?: return null
        return try {
            DeviceConfig(
                deviceId = getOrCreateDeviceId(),
                deviceToken = decrypt(encryptedToken),
                screenId = prefs.getString(KEY_SCREEN_ID, null) ?: branchId,
                branchId = branchId,
                branchAddress = branchAddress
            )
        } catch (error: Exception) {
            Log.e(TAG, "Cannot decrypt local device token; pairing is required again", error)
            clearPairing()
            null
        }
    }

    fun clearPairing() {
        prefs.edit()
            .remove(KEY_DEVICE_TOKEN)
            .remove(KEY_SCREEN_ID)
            .remove(KEY_BRANCH_ID)
            .remove(KEY_BRANCH_ADDRESS)
            .apply()
        clearPendingPairing()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(ciphertext, Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String {
        val parts = value.split(':', limit = 2)
        require(parts.size == 2) { "Invalid encrypted token" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return generator.generateKey()
    }

    private companion object {
        const val TAG = "DeviceConfigStore"
        const val PREFS_NAME = "tv_device_config"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_DEVICE_TOKEN = "device_token_encrypted"
        const val KEY_SCREEN_ID = "screen_id"
        const val KEY_BRANCH_ID = "branch_id"
        const val KEY_BRANCH_ADDRESS = "branch_address"
        const val KEY_PENDING_PAIRING_CODE = "pending_pairing_code"
        const val KEY_PENDING_DEVICE_TOKEN = "pending_device_token_encrypted"
        const val KEY_PENDING_STATUS = "pending_status"
        const val KEY_PENDING_EXPIRES_AT = "pending_expires_at"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "vinhdanh_tv_device_token"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
