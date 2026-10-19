package io.dappily.translator

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * AudioRouterModule — Force audio output to phone speaker or Bluetooth.
 *
 * The key challenge: When Bluetooth (Meta Glasses) is connected, Android routes
 * ALL media audio (including TTS) through Bluetooth A2DP automatically.
 * Simply setting speakerphoneOn=true only affects the voice/call stream.
 *
 * Solution: Disable Bluetooth A2DP routing + set communication device on Android 12+.
 *
 * Usage from JS:
 *   AudioRouter.routeToSpeaker()    → phone speaker (customer hears)
 *   AudioRouter.routeToBluetooth()   → Bluetooth glasses (rep hears privately)
 *   AudioRouter.routeToDefault()     → restore normal routing
 *   AudioRouter.isBluetoothConnected() → check BT availability
 */
class AudioRouterModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AudioRouter"
    }

    override fun getName(): String = "AudioRouter"

    private fun getAudioManager(): AudioManager {
        return reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    /**
     * Force ALL audio (including TTS/media) to phone speaker.
     * Disables Bluetooth A2DP routing so media doesn't leak to glasses.
     */
    @ReactMethod
    fun routeToSpeaker(promise: Promise) {
        try {
            val am = getAudioManager()

            // 1. Stop Bluetooth SCO if active
            if (am.isBluetoothScoOn) {
                am.isBluetoothScoOn = false
                am.stopBluetoothSco()
            }

            // 2. Disable Bluetooth A2DP routing for media audio
            // Deprecated but still functional on Android 12+ for media stream control
            @Suppress("DEPRECATION")
            am.isBluetoothA2dpOn = false

            // 3. Set communication mode + force speaker
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            am.isSpeakerphoneOn = true

            // 4. Android 12+ (API 31): Also set communication device to built-in speaker
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val speaker = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                    .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                if (speaker != null) {
                    am.setCommunicationDevice(speaker)
                    Log.i(TAG, "setCommunicationDevice → BUILTIN_SPEAKER")
                }
            }

            Log.i(TAG, "Routed to SPEAKER (a2dp=OFF, speaker=ON, sco=OFF)")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "routeToSpeaker error: ${e.message}")
            promise.reject("AUDIO_ROUTE_ERROR", e.message)
        }
    }

    /**
     * Route audio to Bluetooth (Meta Glasses earpiece).
     * Re-enables A2DP routing so media audio goes to glasses.
     */
    @ReactMethod
    fun routeToBluetooth(promise: Promise) {
        try {
            val am = getAudioManager()

            // 1. Re-enable Bluetooth A2DP for media audio
            @Suppress("DEPRECATION")
            am.isBluetoothA2dpOn = true

            // 2. Set communication mode, disable speaker
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            am.isSpeakerphoneOn = false

            // 3. Enable Bluetooth SCO for voice stream too
            am.startBluetoothSco()
            am.isBluetoothScoOn = true

            // 4. Android 12+: Set communication device to Bluetooth
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val btDevice = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                    .firstOrNull { device ->
                        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        device.type == AudioDeviceInfo.TYPE_BLE_HEADSET
                    }
                if (btDevice != null) {
                    am.setCommunicationDevice(btDevice)
                    Log.i(TAG, "setCommunicationDevice → BLUETOOTH (${btDevice.type})")
                }
            }

            Log.i(TAG, "Routed to BLUETOOTH (a2dp=ON, speaker=OFF, sco=ON)")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "routeToBluetooth error: ${e.message}")
            promise.reject("AUDIO_ROUTE_ERROR", e.message)
        }
    }

    /**
     * Restore default audio routing.
     * Re-enables A2DP (so Bluetooth works normally for music etc.)
     * and resets mode to NORMAL.
     */
    @ReactMethod
    fun routeToDefault(promise: Promise) {
        try {
            val am = getAudioManager()

            // Re-enable A2DP
            @Suppress("DEPRECATION")
            am.isBluetoothA2dpOn = true

            // Stop SCO if active
            if (am.isBluetoothScoOn) {
                am.isBluetoothScoOn = false
                am.stopBluetoothSco()
            }

            // Reset to normal mode
            am.mode = AudioManager.MODE_NORMAL
            am.isSpeakerphoneOn = false

            // Android 12+: Clear communication device override
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice()
                Log.i(TAG, "clearCommunicationDevice")
            }

            Log.i(TAG, "Routed to DEFAULT (a2dp=ON, mode=NORMAL)")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "routeToDefault error: ${e.message}")
            promise.reject("AUDIO_ROUTE_ERROR", e.message)
        }
    }

    /**
     * Check if a Bluetooth audio output device is connected.
     */
    @ReactMethod
    fun isBluetoothConnected(promise: Promise) {
        try {
            val am = getAudioManager()
            val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            val hasBluetooth = devices.any { device ->
                device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    device.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
            }

            Log.i(TAG, "Bluetooth connected: $hasBluetooth")
            promise.resolve(hasBluetooth)
        } catch (e: Exception) {
            Log.e(TAG, "isBluetoothConnected error: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * Get current audio routing info (for debugging).
     */
    @ReactMethod
    fun getRoutingInfo(promise: Promise) {
        try {
            val am = getAudioManager()
            @Suppress("DEPRECATION")
            val info = "mode=${am.mode}, speaker=${am.isSpeakerphoneOn}, sco=${am.isBluetoothScoOn}, a2dp=${am.isBluetoothA2dpOn}"
            Log.i(TAG, "Routing info: $info")
            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("AUDIO_ROUTE_ERROR", e.message)
        }
    }
}
