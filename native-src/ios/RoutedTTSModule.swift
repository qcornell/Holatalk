// RoutedTTSModule.swift — DEPRECATED (2026-03-08)
//
// This Swift native module is superseded by AudioRouter.m (ObjC, injected by
// the config plugin in plugins/withWhisperCpp.js).
//
// AudioRouter.m owns both AVAudioSession AND AVSpeechSynthesizer with:
//   - Explicit BT exclusion in speaker mode
//   - Route change notification observer
//   - Deactivate→reconfigure→reactivate cycle
//   - Comprehensive logging
//
// speaker.ts now calls AudioRouter.speakOnSpeaker/speakOnBluetooth directly
// instead of RoutedTTS (this module) or expo-speech.
//
// This file is kept empty so EAS Build doesn't pick up the old Swift class
// that would conflict with the ObjC AudioRouter module.
//
// DO NOT add any classes here — it will cause duplicate symbol errors.
