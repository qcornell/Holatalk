import Foundation
import AVFoundation
import React

/**
 * WhisperModule — iOS equivalent of GlassesModule.kt
 *
 * Wraps whisper.cpp C API for on-device STT.
 * Records audio via AVAudioEngine, runs Whisper inference, returns transcription.
 *
 * JS API (same as Android):
 *   GlassesModule.preloadModel()
 *   GlassesModule.ping()
 *   GlassesModule.recordAndTranscribe(durationSeconds)
 *   GlassesModule.recordAndTranscribeForMic(durationSeconds, micMode)
 *   GlassesModule.recordWakeCheck(durationSeconds)
 *   GlassesModule.recordFixedAndTranscribe(durationSeconds)
 */
@objc(GlassesModule)
class WhisperModule: NSObject {

  // MARK: - Constants (match Android values)
  private static let SAMPLE_RATE: Double = 16000
  private static let MODEL_FILE = "ggml-tiny.bin"

  // VAD thresholds (matched to Android)
  private static let SILENCE_THRESHOLD: Float = 250.0 / 32768.0
  private static let SPEECH_THRESHOLD: Float = 350.0 / 32768.0
  private static let SILENCE_AFTER_SPEECH_MS: Int = 1200
  private static let MIN_SPEECH_MS: Int = 200
  private static let MAX_INITIAL_SILENCE_MS: Int = 5000

  private var whisperContext: OpaquePointer? = nil
  private var modelLoaded = false
  private let audioEngine = AVAudioEngine()

  // MARK: - Module Setup

  @objc static func moduleName() -> String { return "GlassesModule" }
  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: - Public API

  @objc func preloadModel(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    if modelLoaded {
      resolve("Model already loaded")
      return
    }

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }

      guard let modelPath = Bundle.main.path(forResource: "ggml-tiny", ofType: "bin") else {
        reject("WHISPER_ERROR", "Model file not found in bundle", nil)
        return
      }

      var params = whisper_context_default_params()
      self.whisperContext = whisper_init_from_file_with_params(modelPath, params)

      if self.whisperContext == nil {
        reject("WHISPER_ERROR", "Failed to init whisper context", nil)
        return
      }

      self.modelLoaded = true
      NSLog("[WhisperModule] Model pre-loaded successfully")
      resolve("Whisper model loaded OK! Ready to transcribe.")
    }
  }

  @objc func ping(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve("pong from ios native")
  }

  @objc func helloNative(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve("Hello from iOS (Texas Edition) 🤠")
  }

  @objc func recordWakeCheck(_ durationSeconds: Double,
                              resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
    ensureModelLoaded { [weak self] error in
      if let error = error {
        reject("WHISPER_ERROR", error, nil)
        return
      }

      self?.recordFixed(duration: durationSeconds) { samples in
        guard let self = self, let samples = samples else {
          reject("WHISPER_ERROR", "Recording failed", nil)
          return
        }

        // VAD check — skip Whisper if silence
        let avgAmplitude = samples.reduce(0) { $0 + abs($1) } / Float(samples.count)
        let threshold: Float = 400.0 / 32768.0

        if avgAmplitude < threshold {
          resolve("SILENCE")
          return
        }

        NSLog("[WhisperModule] Wake VAD: amplitude=\(avgAmplitude), running Whisper...")
        let result = self.transcribe(samples: samples, language: "es", translate: false)
        resolve(result)
      }
    }
  }

  @objc func recordFixedAndTranscribe(_ durationSeconds: Double,
                                       resolve: @escaping RCTPromiseResolveBlock,
                                       reject: @escaping RCTPromiseRejectBlock) {
    ensureModelLoaded { [weak self] error in
      if let error = error {
        reject("WHISPER_ERROR", error, nil)
        return
      }

      self?.recordFixed(duration: durationSeconds) { samples in
        guard let self = self, let samples = samples else {
          reject("WHISPER_ERROR", "Recording failed", nil)
          return
        }

        let result = self.transcribe(samples: samples, language: "es", translate: false)
        resolve(result)
      }
    }
  }

  @objc func recordAndTranscribe(_ durationSeconds: Int,
                                  resolve: @escaping RCTPromiseResolveBlock,
                                  reject: @escaping RCTPromiseRejectBlock) {
    ensureModelLoaded { [weak self] error in
      if let error = error {
        reject("WHISPER_ERROR", error, nil)
        return
      }

      self?.recordWithVAD(maxDuration: durationSeconds) { samples in
        guard let self = self, let samples = samples else {
          reject("WHISPER_ERROR", "Recording failed", nil)
          return
        }

        let result = self.transcribe(samples: samples, language: "es", translate: false)
        resolve(result)
      }
    }
  }

  @objc func recordAndTranscribeForMic(_ durationSeconds: Int,
                                        micMode: String,
                                        resolve: @escaping RCTPromiseResolveBlock,
                                        reject: @escaping RCTPromiseRejectBlock) {
    ensureModelLoaded { [weak self] error in
      if let error = error {
        reject("WHISPER_ERROR", error, nil)
        return
      }

      self?.recordWithVAD(maxDuration: durationSeconds) { samples in
        guard let self = self, let samples = samples else {
          reject("WHISPER_ERROR", "Recording failed", nil)
          return
        }

        let lang = micMode == "customer" ? "es" : "en"
        NSLog("[WhisperModule] \(micMode) mic: lang=\(lang), transcribe only (GPT translates)")

        let result = self.transcribe(samples: samples, language: lang, translate: false)
        resolve(result)
      }
    }
  }

  // MARK: - Audio Recording

  private func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
    try session.setPreferredSampleRate(WhisperModule.SAMPLE_RATE)
    try session.setActive(true)
  }

  /// Fixed-duration recording (no VAD)
  private func recordFixed(duration: Double, completion: @escaping ([Float]?) -> Void) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { completion(nil); return }

      do {
        try self.configureAudioSession()
      } catch {
        NSLog("[WhisperModule] Audio session error: \(error)")
        completion(nil)
        return
      }

      let inputNode = self.audioEngine.inputNode
      let format = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                  sampleRate: WhisperModule.SAMPLE_RATE,
                                  channels: 1,
                                  interleaved: false)!

      var allSamples: [Float] = []
      let totalSamples = Int(WhisperModule.SAMPLE_RATE * duration)

      inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
        let channelData = buffer.floatChannelData![0]
        let frameCount = Int(buffer.frameLength)
        let remaining = totalSamples - allSamples.count
        let toAppend = min(frameCount, remaining)
        allSamples.append(contentsOf: UnsafeBufferPointer(start: channelData, count: toAppend))
      }

      do {
        try self.audioEngine.start()
      } catch {
        NSLog("[WhisperModule] Engine start error: \(error)")
        completion(nil)
        return
      }

      // Wait for recording duration
      Thread.sleep(forTimeInterval: duration)

      self.audioEngine.stop()
      inputNode.removeTap(onBus: 0)

      NSLog("[WhisperModule] Fixed recording: \(allSamples.count) samples")
      completion(allSamples)
    }
  }

  /// VAD-gated recording (matches Android behavior)
  private func recordWithVAD(maxDuration: Int, completion: @escaping ([Float]?) -> Void) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { completion(nil); return }

      do {
        try self.configureAudioSession()
      } catch {
        NSLog("[WhisperModule] Audio session error: \(error)")
        completion(nil)
        return
      }

      let inputNode = self.audioEngine.inputNode
      let format = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                  sampleRate: WhisperModule.SAMPLE_RATE,
                                  channels: 1,
                                  interleaved: false)!

      var allSamples: [Float] = []
      let maxSamples = Int(WhisperModule.SAMPLE_RATE) * maxDuration
      let silenceStopSamples = (WhisperModule.SILENCE_AFTER_SPEECH_MS * Int(WhisperModule.SAMPLE_RATE)) / 1000
      let minSpeechSamples = (WhisperModule.MIN_SPEECH_MS * Int(WhisperModule.SAMPLE_RATE)) / 1000
      let maxInitialSilenceSamples = (WhisperModule.MAX_INITIAL_SILENCE_MS * Int(WhisperModule.SAMPLE_RATE)) / 1000

      var speechSamples = 0
      var consecutiveSilent = 0
      var speechDetected = false
      var shouldStop = false

      inputNode.installTap(onBus: 0, bufferSize: 480, format: format) { buffer, _ in
        guard !shouldStop else { return }

        let channelData = buffer.floatChannelData![0]
        let frameCount = Int(buffer.frameLength)
        let remaining = maxSamples - allSamples.count
        let toAppend = min(frameCount, remaining)

        // Calculate average amplitude
        var sumAbs: Float = 0
        for i in 0..<toAppend {
          sumAbs += abs(channelData[i])
        }
        let avgAmplitude = sumAbs / Float(toAppend)

        allSamples.append(contentsOf: UnsafeBufferPointer(start: channelData, count: toAppend))

        if avgAmplitude >= WhisperModule.SPEECH_THRESHOLD {
          speechDetected = true
          speechSamples += toAppend
          consecutiveSilent = 0
        } else if avgAmplitude < WhisperModule.SILENCE_THRESHOLD {
          consecutiveSilent += toAppend
          if !speechDetected && allSamples.count >= maxInitialSilenceSamples {
            NSLog("[WhisperModule] VAD: No speech after \(WhisperModule.MAX_INITIAL_SILENCE_MS)ms")
            shouldStop = true
          }
          if speechDetected && speechSamples >= minSpeechSamples && consecutiveSilent >= silenceStopSamples {
            NSLog("[WhisperModule] VAD: Speech ended (\(speechSamples * 1000 / Int(WhisperModule.SAMPLE_RATE))ms speech)")
            shouldStop = true
          }
        } else {
          // Ambiguous zone
          consecutiveSilent = 0
          if speechDetected { speechSamples += toAppend }
        }

        if allSamples.count >= maxSamples {
          shouldStop = true
        }
      }

      do {
        try self.audioEngine.start()
      } catch {
        NSLog("[WhisperModule] Engine start error: \(error)")
        completion(nil)
        return
      }

      // Poll until VAD says stop or max duration
      let startTime = Date()
      while !shouldStop && Date().timeIntervalSince(startTime) < Double(maxDuration) {
        Thread.sleep(forTimeInterval: 0.03) // 30ms poll
      }

      self.audioEngine.stop()
      inputNode.removeTap(onBus: 0)

      NSLog("[WhisperModule] VAD recording: \(allSamples.count) samples, speech: \(speechSamples * 1000 / Int(WhisperModule.SAMPLE_RATE))ms")
      completion(allSamples)
    }
  }

  // MARK: - Whisper Transcription

  private func transcribe(samples: [Float], language: String, translate: Bool) -> String {
    guard let ctx = whisperContext else {
      return "ERROR: Model not loaded"
    }

    let start = Date()

    var params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY)
    params.print_progress = false
    params.print_special = false
    params.print_realtime = false
    params.print_timestamps = false
    params.single_segment = true
    params.no_speech_thold = 0.5
    params.n_threads = Int32(min(ProcessInfo.processInfo.activeProcessorCount, 6))
    params.suppress_blank = true
    params.suppress_nst = true
    params.entropy_thold = 2.4

    // Set language
    language.withCString { langPtr in
      params.language = langPtr
    }
    params.translate = translate

    let ret = samples.withUnsafeBufferPointer { bufferPtr in
      whisper_full(ctx, params, bufferPtr.baseAddress, Int32(samples.count))
    }

    let elapsed = Date().timeIntervalSince(start) * 1000
    NSLog("[WhisperModule] Whisper inference: \(Int(elapsed))ms for \(samples.count) samples")

    if ret != 0 {
      NSLog("[WhisperModule] whisper_full failed: \(ret)")
      return "ERROR: Transcription failed"
    }

    let nSegments = whisper_full_n_segments(ctx)
    var result = ""
    for i in 0..<nSegments {
      if let text = whisper_full_get_segment_text(ctx, i) {
        result += String(cString: text)
      }
    }

    NSLog("[WhisperModule] Result: \(result)")
    return result
  }

  // MARK: - Helpers

  private func ensureModelLoaded(completion: @escaping (String?) -> Void) {
    if modelLoaded {
      completion(nil)
      return
    }

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else {
        completion("Module deallocated")
        return
      }

      guard let modelPath = Bundle.main.path(forResource: "ggml-tiny", ofType: "bin") else {
        completion("Model file not found in bundle")
        return
      }

      var params = whisper_context_default_params()
      self.whisperContext = whisper_init_from_file_with_params(modelPath, params)

      if self.whisperContext == nil {
        completion("Failed to init whisper context")
        return
      }

      self.modelLoaded = true
      completion(nil)
    }
  }
}
