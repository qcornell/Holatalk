package io.dappily.translator

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import kotlin.math.abs
import kotlin.math.min

class GlassesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "GlassesModule"
        var nativeLoaded = false
        private var modelLoaded = false
        init {
            try {
                System.loadLibrary("dappily_native")
                nativeLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                nativeLoaded = false
            }
        }
        private const val SAMPLE_RATE = 16000
        
        // Model file — use multilingual (not .en) so it can hear Spanish
        // ggml-tiny.bin = multilingual, ggml-tiny.en.bin = English only
        private const val MODEL_FILE = "ggml-tiny.bin"

        // VAD (Voice Activity Detection) settings
        // Balance: catch short words ("sí") but let longer sentences finish
        private const val SILENCE_THRESHOLD = 250       // amplitude below this = definite silence
        private const val SPEECH_THRESHOLD = 350        // lowered from 400 — catch softer speech
        private const val SILENCE_AFTER_SPEECH_MS = 1200 // 1.2s silence after speech → auto-stop (was 450ms — too fast, cut off sentences)
        private const val MIN_SPEECH_MS = 200            // 200ms of speech is enough
        private const val MAX_INITIAL_SILENCE_MS = 5000  // 5s before giving up (was 4s)
    }

    override fun getName(): String = "GlassesModule"

    // JNI functions
    private external fun helloFromCpp(): String
    private external fun transcribeFromAsset(assetManager: android.content.res.AssetManager, modelPath: String): String
    private external fun transcribeAudioConfigured(audioData: FloatArray, language: String, doTranslate: Boolean): String
    private external fun transcribeAudio(audioData: FloatArray): String

    /**
     * Pre-load the Whisper model at app startup.
     * Uses ggml-tiny (multilingual) so it can hear both English AND Spanish.
     * Call this once from JS when the app mounts — makes first transcription instant.
     */
    @ReactMethod
    fun preloadModel(promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("WHISPER_ERROR", "Native library failed to load")
            return
        }
        if (modelLoaded) {
            promise.resolve("Model already loaded")
            return
        }
        Thread {
            try {
                val assetManager = reactApplicationContext.assets
                // Use multilingual model — can hear "Hola" + Spanish phrases
                val result = transcribeFromAsset(assetManager, MODEL_FILE)
                modelLoaded = true
                Log.i(TAG, "Model pre-loaded: $result")
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("WHISPER_ERROR", e.message)
            }
        }.start()
    }

    @ReactMethod
    fun ping(promise: Promise) {
        promise.resolve("pong from android native")
    }

    @ReactMethod
    fun helloNative(promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("CPP_ERROR", "Native library failed to load")
            return
        }
        try {
            val result = helloFromCpp()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CPP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun testWhisperLoad(promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("WHISPER_ERROR", "Native library failed to load")
            return
        }
        try {
            val assetManager = reactApplicationContext.assets
            val result = transcribeFromAsset(assetManager, "ggml-tiny.en.bin")
            modelLoaded = true
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("WHISPER_ERROR", e.message)
        }
    }

    /**
     * Fast fixed-duration record + transcribe — NO VAD.
     * Used for wake word detection. Records exactly N seconds, no waiting.
     */
    /**
     * VAD-gated wake word check.
     * Records audio, checks amplitude FIRST. If silence → returns "SILENCE" 
     * without running Whisper at all. Only runs Whisper if speech detected.
     * Saves battery + kills hallucinations.
     */
    @ReactMethod
    fun recordWakeCheck(durationSeconds: Double, promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("WHISPER_ERROR", "Native library failed to load")
            return
        }

        if (ActivityCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_ERROR", "RECORD_AUDIO permission not granted")
            return
        }

        Thread {
            try {
                val assetManager = reactApplicationContext.assets
                transcribeFromAsset(assetManager, MODEL_FILE)
                modelLoaded = true

                val bufferSize = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
                )
                val safeBufferSize = if (bufferSize < SAMPLE_RATE) SAMPLE_RATE else bufferSize

                val totalSamples = (SAMPLE_RATE * durationSeconds).toInt()
                val shortBuffer = ShortArray(totalSamples)
                var samplesRead = 0

                val recorder = AudioRecord(
                    MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, safeBufferSize
                )

                recorder.startRecording()
                while (samplesRead < totalSamples) {
                    val toRead = min(safeBufferSize / 2, totalSamples - samplesRead)
                    val read = recorder.read(shortBuffer, samplesRead, toRead)
                    if (read > 0) samplesRead += read else break
                }
                recorder.stop()
                recorder.release()

                // ── VAD CHECK: Calculate average amplitude ──
                var sumAbs: Long = 0
                for (i in 0 until samplesRead) {
                    sumAbs += abs(shortBuffer[i].toInt())
                }
                val avgAmplitude = if (samplesRead > 0) sumAbs / samplesRead else 0

                // If too quiet, skip Whisper entirely → saves battery + no hallucinations
                if (avgAmplitude < 400) {
                    promise.resolve("SILENCE")
                    return@Thread
                }

                Log.i(TAG, "Wake VAD: amplitude=$avgAmplitude, running Whisper...")

                // Convert + transcribe only when speech detected
                val floatBuffer = FloatArray(samplesRead)
                for (i in 0 until samplesRead) {
                    floatBuffer[i] = shortBuffer[i] / 32768.0f
                }

                val result = transcribeAudio(floatBuffer)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("WHISPER_ERROR", e.message)
            }
        }.start()
    }

    @ReactMethod
    fun recordFixedAndTranscribe(durationSeconds: Double, promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("WHISPER_ERROR", "Native library failed to load")
            return
        }

        if (ActivityCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_ERROR", "RECORD_AUDIO permission not granted")
            return
        }

        Thread {
            try {
                // Always ensure model is loaded
                val assetManager = reactApplicationContext.assets
                transcribeFromAsset(assetManager, MODEL_FILE)
                modelLoaded = true

                val bufferSize = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
                )
                val safeBufferSize = if (bufferSize < SAMPLE_RATE) SAMPLE_RATE else bufferSize

                val totalSamples = (SAMPLE_RATE * durationSeconds).toInt()
                val shortBuffer = ShortArray(totalSamples)
                var samplesRead = 0

                val recorder = AudioRecord(
                    MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, safeBufferSize
                )

                recorder.startRecording()
                while (samplesRead < totalSamples) {
                    val toRead = min(safeBufferSize / 2, totalSamples - samplesRead)
                    val read = recorder.read(shortBuffer, samplesRead, toRead)
                    if (read > 0) samplesRead += read else break
                }
                recorder.stop()
                recorder.release()

                val floatBuffer = FloatArray(samplesRead)
                for (i in 0 until samplesRead) {
                    floatBuffer[i] = shortBuffer[i] / 32768.0f
                }

                val result = transcribeAudio(floatBuffer)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("WHISPER_ERROR", e.message)
            }
        }.start()
    }

    @ReactMethod
    fun recordAndTranscribe(durationSeconds: Int, promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("WHISPER_ERROR", "Native library failed to load")
            return
        }

        // Check permission
        if (ActivityCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_ERROR", "RECORD_AUDIO permission not granted")
            return
        }

        Thread {
            try {
                // Load model only if not already loaded
                if (!modelLoaded) {
                    Log.i(TAG, "Model not pre-loaded, loading now...")
                    val assetManager = reactApplicationContext.assets
                    transcribeFromAsset(assetManager, MODEL_FILE)
                    modelLoaded = true
                }

                // Record audio
                val bufferSize = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
                )
                
                // Ensure buffer is large enough
                val safeBufferSize = if (bufferSize < SAMPLE_RATE) SAMPLE_RATE else bufferSize

                val recorder = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    safeBufferSize
                )

                // Allocate for max duration, but VAD will stop us early
                val maxSamples = SAMPLE_RATE * durationSeconds
                val shortBuffer = ShortArray(maxSamples)
                var samplesRead = 0

                // VAD state machine: WAITING → SPEECH → TRAILING_SILENCE → DONE
                val silenceStopSamples = (SILENCE_AFTER_SPEECH_MS * SAMPLE_RATE) / 1000
                val minSpeechSamples = (MIN_SPEECH_MS * SAMPLE_RATE) / 1000
                val maxInitialSilenceSamples = (MAX_INITIAL_SILENCE_MS * SAMPLE_RATE) / 1000
                var speechSamples = 0           // how many samples of speech we've seen
                var consecutiveSilent = 0       // current streak of silence
                var speechDetected = false      // have we heard speech at all?
                val chunkSize = min(safeBufferSize / 2, 480) // 30ms chunks — very responsive

                recorder.startRecording()
                val startTime = System.currentTimeMillis()

                while (samplesRead < maxSamples) {
                    val remaining = maxSamples - samplesRead
                    val toRead = min(chunkSize, remaining)
                    val read = recorder.read(shortBuffer, samplesRead, toRead)
                    
                    if (read <= 0) break

                    // Calculate average amplitude of this chunk
                    var sumAbs: Long = 0
                    for (i in samplesRead until samplesRead + read) {
                        sumAbs += abs(shortBuffer[i].toInt())
                    }
                    val avgAmplitude = sumAbs / read

                    samplesRead += read

                    if (avgAmplitude >= SPEECH_THRESHOLD) {
                        // Speech detected
                        speechDetected = true
                        speechSamples += read
                        consecutiveSilent = 0
                    } else if (avgAmplitude < SILENCE_THRESHOLD) {
                        // Definite silence
                        consecutiveSilent += read

                        if (!speechDetected && samplesRead >= maxInitialSilenceSamples) {
                            Log.i(TAG, "VAD: No speech detected after ${MAX_INITIAL_SILENCE_MS}ms, stopping")
                            break
                        }

                        if (speechDetected && speechSamples >= minSpeechSamples && consecutiveSilent >= silenceStopSamples) {
                            Log.i(TAG, "VAD: Speech ended after ${System.currentTimeMillis() - startTime}ms (${speechSamples * 1000 / SAMPLE_RATE}ms speech + ${SILENCE_AFTER_SPEECH_MS}ms silence)")
                            break
                        }
                    } else {
                        // Ambiguous zone (between silence and speech thresholds)
                        // Treat as "not silence" — reset silence counter so natural
                        // pauses between words don't trigger early stop
                        consecutiveSilent = 0
                        if (speechDetected) {
                            speechSamples += read
                        }
                    }
                }

                val recordDuration = System.currentTimeMillis() - startTime
                Log.i(TAG, "Recorded $samplesRead samples in ${recordDuration}ms (speech: ${speechSamples * 1000 / SAMPLE_RATE}ms)")

                recorder.stop()
                recorder.release()

                // Convert Short PCM to Float [-1.0, 1.0]
                val floatBuffer = FloatArray(samplesRead)
                for (i in 0 until samplesRead) {
                    floatBuffer[i] = shortBuffer[i] / 32768.0f
                }

                // Transcribe
                val transcribeStart = System.currentTimeMillis()
                val result = transcribeAudio(floatBuffer)
                val transcribeDuration = System.currentTimeMillis() - transcribeStart
                Log.i(TAG, "Transcription took ${transcribeDuration}ms")

                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject("WHISPER_ERROR", e.message)
            }
        }.start()
    }

    /**
     * Record + transcribe with configurable language and translate mode.
     * micMode: "customer" = Spanish→English, "rep" = English→Spanish
     * 
     * Customer mic: language="es", translate=true  → Whisper outputs English
     * Rep mic:      language="en", translate=false → Whisper outputs English (we translate in JS)
     */
    @ReactMethod
    fun recordAndTranscribeForMic(durationSeconds: Int, micMode: String, promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("WHISPER_ERROR", "Native library failed to load")
            return
        }

        if (ActivityCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_ERROR", "RECORD_AUDIO permission not granted")
            return
        }

        Thread {
            try {
                if (!modelLoaded) {
                    val assetManager = reactApplicationContext.assets
                    transcribeFromAsset(assetManager, MODEL_FILE)
                    modelLoaded = true
                }

                val bufferSize = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
                )
                val safeBufferSize = if (bufferSize < SAMPLE_RATE) SAMPLE_RATE else bufferSize

                val maxSamples = SAMPLE_RATE * durationSeconds
                val shortBuffer = ShortArray(maxSamples)
                var samplesRead = 0

                val silenceStopSamples = (SILENCE_AFTER_SPEECH_MS * SAMPLE_RATE) / 1000
                val minSpeechSamples = (MIN_SPEECH_MS * SAMPLE_RATE) / 1000
                val maxInitialSilenceSamples = (MAX_INITIAL_SILENCE_MS * SAMPLE_RATE) / 1000
                var speechSamples = 0
                var consecutiveSilent = 0
                var speechDetected = false
                val chunkSize = min(safeBufferSize / 2, 480)

                val recorder = AudioRecord(
                    MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, safeBufferSize
                )

                recorder.startRecording()
                val startTime = System.currentTimeMillis()

                while (samplesRead < maxSamples) {
                    val remaining = maxSamples - samplesRead
                    val toRead = min(chunkSize, remaining)
                    val read = recorder.read(shortBuffer, samplesRead, toRead)
                    if (read <= 0) break

                    var sumAbs: Long = 0
                    for (i in samplesRead until samplesRead + read) {
                        sumAbs += abs(shortBuffer[i].toInt())
                    }
                    val avgAmplitude = sumAbs / read
                    samplesRead += read

                    if (avgAmplitude >= SPEECH_THRESHOLD) {
                        speechDetected = true
                        speechSamples += read
                        consecutiveSilent = 0
                    } else if (avgAmplitude < SILENCE_THRESHOLD) {
                        consecutiveSilent += read
                        if (!speechDetected && samplesRead >= maxInitialSilenceSamples) break
                        if (speechDetected && speechSamples >= minSpeechSamples && consecutiveSilent >= silenceStopSamples) break
                    } else {
                        consecutiveSilent = 0
                        if (speechDetected) speechSamples += read
                    }
                }

                recorder.stop()
                recorder.release()

                val floatBuffer = FloatArray(samplesRead)
                for (i in 0 until samplesRead) {
                    floatBuffer[i] = shortBuffer[i] / 32768.0f
                }

                // Configure based on mic mode
                // Whisper does STT only — translation handled by GPT API in JS
                val lang: String
                val translate = false  // Never use Whisper translate — GPT does it better
                if (micMode == "customer") {
                    lang = "es"
                    Log.i(TAG, "Customer mic: lang=es, transcribe only (GPT translates)")
                } else {
                    lang = "en"
                    Log.i(TAG, "Rep mic: lang=en, transcribe only (GPT translates)")
                }

                val transcribeStart = System.currentTimeMillis()
                val result = transcribeAudioConfigured(floatBuffer, lang, translate)
                val transcribeDuration = System.currentTimeMillis() - transcribeStart
                Log.i(TAG, "Configured transcription took ${transcribeDuration}ms: $result")

                promise.resolve(result)

            } catch (e: Exception) {
                promise.reject("WHISPER_ERROR", e.message)
            }
        }.start()
    }
}
