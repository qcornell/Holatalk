package io.dappily.translator

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * RoutedTTSModule — Text-to-Speech with explicit audio output routing.
 *
 * The problem: expo-speech uses the MEDIA stream. When Bluetooth A2DP is connected,
 * Android routes ALL media audio to Bluetooth. You cannot override this from JS.
 *
 * The fix: Use Android's TextToSpeech API directly with AudioAttributes set to
 * USAGE_VOICE_COMMUNICATION. This stream CAN be routed via speakerphone/SCO controls.
 *
 * JS API:
 *   RoutedTTS.speakOnSpeaker(text, lang, rate)   → phone speaker (customer hears)
 *   RoutedTTS.speakOnBluetooth(text, lang, rate)  → Bluetooth glasses (rep hears)
 *   RoutedTTS.stop()                               → stop speaking
 *   RoutedTTS.isReady()                            → check if TTS engine initialized
 */
class RoutedTTSModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "RoutedTTS"
    }

    override fun getName(): String = "RoutedTTS"

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var currentPromise: Promise? = null
    
    /**
     * When true, we're in "speaker loud" mode and should NOT restore default routing
     * until explicitly released (via stop or a new non-speaker speak call).
     * This prevents Android from re-routing to BT between TTS sentence chunks.
     */
    private var speakerLocked = false

    private fun getAudioManager(): AudioManager {
        return reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    /**
     * Initialize TTS engine. Call once at app startup.
     */
    @ReactMethod
    fun initialize(promise: Promise) {
        if (ttsReady && tts != null) {
            promise.resolve(true)
            return
        }

        tts = TextToSpeech(reactApplicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                ttsReady = true
                Log.i(TAG, "TTS engine initialized")
                promise.resolve(true)
            } else {
                Log.e(TAG, "TTS init failed with status: $status")
                promise.resolve(false)
            }
        }
    }

    /**
     * Speak text through the PHONE SPEAKER, even when Bluetooth is connected.
     * 
     * How it works:
     * 1. Set AudioAttributes to USAGE_VOICE_COMMUNICATION (bypasses A2DP)
     * 2. Set AudioManager to communication mode + speakerphone ON
     * 3. On Android 12+, explicitly set communication device to built-in speaker
     * 4. Speak using the communication audio stream
     * 5. Restore default routing when done
     */
    /**
     * Force speaker routing. Called at the start of speakOnSpeaker and
     * periodically during long utterances to prevent Android from reclaiming
     * the route for Bluetooth.
     */
    private fun forceSpeakerRoute() {
        val am = getAudioManager()
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        am.isSpeakerphoneOn = true

        // Kill Bluetooth SCO so voice stream doesn't drift there
        if (am.isBluetoothScoOn) {
            am.isBluetoothScoOn = false
            am.stopBluetoothSco()
        }

        // Android 12+: explicitly pin communication device to built-in speaker
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val speaker = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            if (speaker != null) {
                am.setCommunicationDevice(speaker)
            }
        }
    }

    @ReactMethod
    fun speakOnSpeaker(text: String, language: String, rate: Float, promise: Promise) {
        if (!ttsReady || tts == null) {
            promise.reject("TTS_NOT_READY", "Call initialize() first")
            return
        }

        currentPromise = promise
        speakerLocked = true

        try {
            // Step 1: Configure TTS to use VOICE_COMMUNICATION stream
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            tts!!.setAudioAttributes(attrs)

            // Step 2: Force speaker routing (and lock it)
            forceSpeakerRoute()

            // Step 3: Set language and rate
            val locale = when {
                language.startsWith("es") -> Locale("es", "US")
                else -> Locale.US
            }
            tts!!.language = locale
            tts!!.setSpeechRate(rate)

            // Step 4: Set completion listener
            tts!!.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    Log.i(TAG, "Speaker chunk started: $utteranceId")
                    // Re-assert speaker route at the start of EVERY chunk
                    forceSpeakerRoute()
                }

                override fun onDone(utteranceId: String?) {
                    Log.i(TAG, "Speaker chunk done: $utteranceId")
                    // Only finish on the final utterance (not intermediate chunks)
                    if (utteranceId == "speaker_utterance") {
                        // Small delay to confirm TTS truly stopped
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            if (tts?.isSpeaking == true) {
                                Log.i(TAG, "TTS still going after final chunk — re-asserting")
                                forceSpeakerRoute()
                            } else {
                                Log.i(TAG, "TTS truly finished — releasing speaker lock")
                                speakerLocked = false
                                restoreDefaultRouting()
                                sendEvent("onTTSDone", "speaker")
                                currentPromise?.resolve(true)
                                currentPromise = null
                            }
                        }, 100)
                    } else {
                        // Intermediate chunk done — re-assert speaker before next chunk starts
                        forceSpeakerRoute()
                    }
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    Log.e(TAG, "TTS error on SPEAKER: $utteranceId")
                    speakerLocked = false
                    restoreDefaultRouting()
                    sendEvent("onTTSDone", "speaker")
                    currentPromise?.resolve(false)
                    currentPromise = null
                }

                override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
                    // Called within each utterance as words are spoken — keep speaker pinned
                    if (speakerLocked) {
                        forceSpeakerRoute()
                    }
                }
            })

            // Step 5: Speak — use STREAM_VOICE_CALL to stay on communication path
            val params = Bundle()
            params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL)

            // Android TTS has a ~4000 char limit per utterance and may split text.
            // We manually chunk at sentence boundaries to keep control of routing.
            val maxChunk = 250 // Characters per chunk — keeps each utterance short
            val chunks = splitIntoChunks(text, maxChunk)
            
            if (chunks.size == 1) {
                tts!!.speak(chunks[0], TextToSpeech.QUEUE_FLUSH, params, "speaker_utterance")
            } else {
                // Queue all chunks — onDone fires only for the LAST one
                for (i in chunks.indices) {
                    val id = if (i == chunks.lastIndex) "speaker_utterance" else "speaker_chunk_$i"
                    val mode = if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
                    tts!!.speak(chunks[i], mode, params, id)
                }
            }

            Log.i(TAG, "speakOnSpeaker: '${text.take(40)}...' lang=$language rate=$rate chunks=${chunks.size} [LOCKED]")

        } catch (e: Exception) {
            Log.e(TAG, "speakOnSpeaker error: ${e.message}")
            speakerLocked = false
            restoreDefaultRouting()
            promise.reject("TTS_ERROR", e.message)
        }
    }

    /**
     * Speak text through BLUETOOTH (Meta Glasses earpiece).
     *
     * Routes the communication stream to Bluetooth SCO/A2DP device.
     */
    @ReactMethod
    fun speakOnBluetooth(text: String, language: String, rate: Float, promise: Promise) {
        if (!ttsReady || tts == null) {
            promise.reject("TTS_NOT_READY", "Call initialize() first")
            return
        }

        currentPromise = promise
        val am = getAudioManager()

        try {
            // Use voice communication stream
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            tts!!.setAudioAttributes(attrs)

            // Route to Bluetooth
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            am.isSpeakerphoneOn = false
            am.startBluetoothSco()
            am.isBluetoothScoOn = true

            // Android 12+: Set communication device to Bluetooth
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val btDevice = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                    .firstOrNull { device ->
                        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                        device.type == AudioDeviceInfo.TYPE_BLE_HEADSET
                    }
                if (btDevice != null) {
                    am.setCommunicationDevice(btDevice)
                    Log.i(TAG, "Communication device → BLUETOOTH (type=${btDevice.type})")
                }
            }

            // Set language and rate
            val locale = when {
                language.startsWith("es") -> Locale("es", "US")
                else -> Locale.US
            }
            tts!!.language = locale
            tts!!.setSpeechRate(rate)

            // Completion listener
            tts!!.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    Log.i(TAG, "Speaking on BLUETOOTH started")
                }

                override fun onDone(utteranceId: String?) {
                    Log.i(TAG, "Speaking on BLUETOOTH done")
                    restoreDefaultRouting()
                    sendEvent("onTTSDone", "bluetooth")
                    currentPromise?.resolve(true)
                    currentPromise = null
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    Log.e(TAG, "TTS error on BLUETOOTH")
                    restoreDefaultRouting()
                    sendEvent("onTTSDone", "bluetooth")
                    currentPromise?.resolve(false)
                    currentPromise = null
                }
            })

            // Delay to let Bluetooth SCO connection establish before speaking
            // Without this, the first word gets cut off
            Thread.sleep(300)

            // Speak
            val params = Bundle()
            params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL)
            tts!!.speak(text, TextToSpeech.QUEUE_FLUSH, params, "bluetooth_utterance")

            Log.i(TAG, "speakOnBluetooth: '${text.take(40)}...' lang=$language rate=$rate")

        } catch (e: Exception) {
            Log.e(TAG, "speakOnBluetooth error: ${e.message}")
            restoreDefaultRouting()
            promise.reject("TTS_ERROR", e.message)
        }
    }

    /**
     * Stop speaking immediately.
     */
    @ReactMethod
    fun stop(promise: Promise) {
        tts?.stop()
        speakerLocked = false
        restoreDefaultRouting()
        currentPromise?.resolve(false)
        currentPromise = null
        promise.resolve(true)
    }

    /**
     * Check if TTS is initialized and ready.
     */
    @ReactMethod
    fun isReady(promise: Promise) {
        promise.resolve(ttsReady)
    }

    /**
     * Check if currently speaking.
     */
    @ReactMethod
    fun isSpeaking(promise: Promise) {
        promise.resolve(tts?.isSpeaking ?: false)
    }

    // ── Internal helpers ──

    /**
     * Split text into chunks at sentence boundaries (period, question mark, exclamation).
     * Falls back to splitting at spaces if sentences are too long.
     * This keeps each TTS utterance short so we can re-assert speaker route between them.
     */
    private fun splitIntoChunks(text: String, maxLen: Int): List<String> {
        if (text.length <= maxLen) return listOf(text)

        val chunks = mutableListOf<String>()
        // Split on sentence-ending punctuation (keeping the punctuation)
        val sentences = text.split(Regex("(?<=[.!?¿¡])\\s+")).filter { it.isNotBlank() }

        var current = StringBuilder()
        for (sentence in sentences) {
            if (current.length + sentence.length + 1 > maxLen && current.isNotEmpty()) {
                chunks.add(current.toString().trim())
                current = StringBuilder()
            }
            if (current.isNotEmpty()) current.append(" ")
            current.append(sentence)
        }
        if (current.isNotEmpty()) chunks.add(current.toString().trim())

        // If any chunk is still too long, split at word boundaries
        val result = mutableListOf<String>()
        for (chunk in chunks) {
            if (chunk.length <= maxLen) {
                result.add(chunk)
            } else {
                val words = chunk.split(" ")
                val sub = StringBuilder()
                for (word in words) {
                    if (sub.length + word.length + 1 > maxLen && sub.isNotEmpty()) {
                        result.add(sub.toString().trim())
                        sub.clear()
                    }
                    if (sub.isNotEmpty()) sub.append(" ")
                    sub.append(word)
                }
                if (sub.isNotEmpty()) result.add(sub.toString().trim())
            }
        }

        return if (result.isEmpty()) listOf(text) else result
    }

    private fun restoreDefaultRouting() {
        try {
            val am = getAudioManager()
            if (am.isBluetoothScoOn) {
                am.isBluetoothScoOn = false
                am.stopBluetoothSco()
            }
            am.isSpeakerphoneOn = false
            am.mode = AudioManager.MODE_NORMAL

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice()
            }

            Log.i(TAG, "Restored default audio routing")
        } catch (e: Exception) {
            Log.e(TAG, "restoreDefaultRouting error: ${e.message}")
        }
    }

    private fun sendEvent(eventName: String, route: String) {
        try {
            val params = com.facebook.react.bridge.Arguments.createMap()
            params.putString("route", route)
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.e(TAG, "sendEvent error: ${e.message}")
        }
    }
}
