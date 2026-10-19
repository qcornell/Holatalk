#include <jni.h>
#include <string>
#include <vector>
#include <android/log.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include "whisper.h"
#include <chrono>

#define LOG_TAG "GlassesNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static struct whisper_context *g_ctx = nullptr;

extern "C" {

    JNIEXPORT jstring JNICALL
    Java_io_dappily_translator_GlassesModule_helloFromCpp(JNIEnv *env, jobject) {
        return env->NewStringUTF("Hello from C++ (Texas Edition) 🤠");
    }

    JNIEXPORT jstring JNICALL
    Java_io_dappily_translator_GlassesModule_transcribeFromAsset(
            JNIEnv *env,
            jobject,
            jobject assetManager,
            jstring modelPath
    ) {
        if (g_ctx) {
            LOGI("Whisper model already loaded, reusing.");
            return env->NewStringUTF("Whisper model loaded OK! Ready to transcribe.");
        }

        AAssetManager *mgr = AAssetManager_fromJava(env, assetManager);
        if (!mgr) {
            LOGE("Failed to get AssetManager");
            return env->NewStringUTF("ERROR: Failed to get AssetManager");
        }

        const char *path = env->GetStringUTFChars(modelPath, nullptr);
        AAsset *asset = AAssetManager_open(mgr, path, AASSET_MODE_BUFFER);
        if (!asset) {
            LOGE("Failed to open model: %s", path);
            env->ReleaseStringUTFChars(modelPath, path);
            return env->NewStringUTF("ERROR: Failed to open model file");
        }

        size_t modelSize = AAsset_getLength(asset);
        LOGI("Loading model: %zu bytes", modelSize);

        void *modelData = malloc(modelSize);
        AAsset_read(asset, modelData, modelSize);
        AAsset_close(asset);
        env->ReleaseStringUTFChars(modelPath, path);

        struct whisper_context_params cparams = whisper_context_default_params();
        g_ctx = whisper_init_from_buffer_with_params(modelData, modelSize, cparams);
        free(modelData);

        if (!g_ctx) {
            LOGE("Failed to init whisper context");
            return env->NewStringUTF("ERROR: Failed to init whisper");
        }

        LOGI("Whisper model loaded successfully!");
        return env->NewStringUTF("Whisper model loaded OK! Ready to transcribe.");
    }

    JNIEXPORT jstring JNICALL
    Java_io_dappily_translator_GlassesModule_transcribeAudio(
            JNIEnv *env,
            jobject,
            jfloatArray audioData
    ) {
        if (!g_ctx) {
            return env->NewStringUTF("ERROR: Model not loaded. Call transcribeFromAsset first.");
        }

        jsize numSamples = env->GetArrayLength(audioData);
        LOGI("Transcribing %d samples (auto-detect, no translate)", numSamples);

        jfloat *samples = env->GetFloatArrayElements(audioData, nullptr);

        struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.print_progress = false;
        params.print_special = false;
        params.print_realtime = false;
        params.print_timestamps = false;
        params.single_segment = true;
        params.language = "es";           // Default to Spanish — wake word "Hola" + general use
        params.translate = false;         // Keep original text — translation done by GPT
        params.no_speech_thold = 0.5f;
        params.n_threads = 6;
        params.suppress_blank = true;
        params.suppress_nst = true;
        params.entropy_thold = 2.4f;

        auto start = std::chrono::high_resolution_clock::now();
        int ret = whisper_full(g_ctx, params, samples, numSamples);
        auto end = std::chrono::high_resolution_clock::now();
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        LOGI("Whisper inference took %lld ms for %d samples", ms, numSamples);

        env->ReleaseFloatArrayElements(audioData, samples, 0);

        if (ret != 0) {
            LOGE("whisper_full failed with code %d", ret);
            return env->NewStringUTF("ERROR: Transcription failed");
        }

        int nSegments = whisper_full_n_segments(g_ctx);
        std::string result;
        for (int i = 0; i < nSegments; i++) {
            result += whisper_full_get_segment_text(g_ctx, i);
        }

        LOGI("Transcription: %s", result.c_str());
        return env->NewStringUTF(result.c_str());
    }

    /**
     * Transcribe audio with configurable language and translate mode.
     * language: "es", "en", "auto"
     * doTranslate: true = translate to English (Whisper built-in)
     */
    JNIEXPORT jstring JNICALL
    Java_io_dappily_translator_GlassesModule_transcribeAudioConfigured(
            JNIEnv *env,
            jobject,
            jfloatArray audioData,
            jstring language,
            jboolean doTranslate
    ) {
        if (!g_ctx) {
            return env->NewStringUTF("ERROR: Model not loaded. Call transcribeFromAsset first.");
        }

        const char *lang = env->GetStringUTFChars(language, nullptr);
        jsize numSamples = env->GetArrayLength(audioData);
        LOGI("Transcribing %d samples (lang=%s, translate=%d)", numSamples, lang, doTranslate);

        jfloat *samples = env->GetFloatArrayElements(audioData, nullptr);

        struct whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.print_progress = false;
        params.print_special = false;
        params.print_realtime = false;
        params.print_timestamps = false;
        params.single_segment = true;
        params.language = lang;
        params.translate = doTranslate;
        params.no_speech_thold = 0.5f;
        params.n_threads = 6;
        params.suppress_blank = true;
        params.suppress_nst = true;
        params.entropy_thold = 2.4f;

        auto start = std::chrono::high_resolution_clock::now();
        int ret = whisper_full(g_ctx, params, samples, numSamples);
        auto end = std::chrono::high_resolution_clock::now();
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        LOGI("Whisper inference took %lld ms", ms);

        env->ReleaseFloatArrayElements(audioData, samples, 0);
        env->ReleaseStringUTFChars(language, lang);

        if (ret != 0) {
            LOGE("whisper_full failed with code %d", ret);
            return env->NewStringUTF("ERROR: Transcription failed");
        }

        int nSegments = whisper_full_n_segments(g_ctx);
        std::string result;
        for (int i = 0; i < nSegments; i++) {
            result += whisper_full_get_segment_text(g_ctx, i);
        }

        LOGI("Result: %s", result.c_str());
        return env->NewStringUTF(result.c_str());
    }
}
