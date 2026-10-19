// RoutedTTSModule.m — DEPRECATED (2026-03-08)
//
// The ObjC bridge for RoutedTTS is no longer needed. All iOS TTS + routing
// is now handled by AudioRouter.m (injected by the config plugin).
//
// speaker.ts calls AudioRouter.speakOnSpeaker/speakOnBluetooth directly.
//
// DO NOT add any code here — it would register a RoutedTTS module with no
// backing Swift class, causing silent failures.
