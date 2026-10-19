# iOS Setup Guide — Hola D2D

## Prerequisites
- [x] Apple Developer Account ($99/yr) — https://developer.apple.com/account
- [x] Mac with Xcode 16+ installed
- [x] Physical iPhone for testing (mic doesn't work in simulator)
- [x] Node.js 18+ on the Mac

## Step 1: Clone & Install

```bash
# On the Mac:
git clone <your-repo> && cd apps/DappilyDirector
npm install
```

## Step 2: Generate iOS Project

```bash
npx expo prebuild --platform ios
```

This creates the `ios/` folder with Xcode project, Podfile, etc.

## Step 3: Add Whisper C++ Source

The Android build compiles whisper.cpp from `android/app/src/main/cpp/whisper.cpp/`.
For iOS, we need the same source compiled for ARM64.

```bash
# Copy the whisper.cpp source into the iOS project
cp -r android/app/src/main/cpp/whisper.cpp ios/HolaD2D/whisper.cpp

# Copy the model file into the iOS bundle
mkdir -p ios/HolaD2D/Resources
cp android/app/src/main/assets/ggml-tiny.bin ios/HolaD2D/Resources/
```

## Step 4: Add Native Modules

Copy the pre-written iOS native modules:

```bash
# These are already written and waiting in native-src/ios/
cp native-src/ios/WhisperModule.swift ios/HolaD2D/
cp native-src/ios/WhisperModule.m ios/HolaD2D/
cp native-src/ios/AudioRouterModule.swift ios/HolaD2D/
cp native-src/ios/AudioRouterModule.m ios/HolaD2D/
cp native-src/ios/RoutedTTSModule.swift ios/HolaD2D/
cp native-src/ios/RoutedTTSModule.m ios/HolaD2D/
```

## Step 5: Create Bridging Header

Create `ios/HolaD2D/HolaD2D-Bridging-Header.h`:

```objc
// HolaD2D-Bridging-Header.h
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Whisper C API
#include "whisper.h"
```

Set this in Xcode: Build Settings → Swift Compiler → Objective-C Bridging Header → `HolaD2D/HolaD2D-Bridging-Header.h`

## Step 6: Add whisper.cpp to Xcode Build

In Xcode:
1. Open `ios/HolaD2D.xcworkspace`
2. Right-click HolaD2D target → Add Files → select `whisper.cpp/` folder
3. **Important:** Only add these source files to the build:
   - `whisper.cpp/src/whisper.cpp`
   - `whisper.cpp/ggml/src/ggml.c`
   - `whisper.cpp/ggml/src/ggml-alloc.c`
   - `whisper.cpp/ggml/src/ggml-backend.c`
   - `whisper.cpp/ggml/src/ggml-metal.m` (enables Apple GPU acceleration!)
   - `whisper.cpp/ggml/src/ggml-quants.c`
4. Add Header Search Paths (Build Settings):
   - `$(SRCROOT)/HolaD2D/whisper.cpp/include`
   - `$(SRCROOT)/HolaD2D/whisper.cpp/ggml/include`
5. Add `ggml-tiny.bin` to "Copy Bundle Resources" build phase
6. Add `Accelerate.framework` and `Metal.framework` to Link Binary With Libraries
7. Set C/C++ compiler flags: `-O3 -DNDEBUG -DGGML_USE_METAL`

### Alternative: Use CMake via CocoaPods

If manual Xcode setup is too painful, create a podspec:

```ruby
# In Podfile, add:
pod 'whisper-cpp', :path => './HolaD2D/whisper.cpp'
```

Or use the whisper.cpp repo's existing iOS integration example as reference:
`whisper.cpp/examples/whisper.swiftui/`

## Step 7: Build & Run

```bash
# Install CocoaPods
cd ios && pod install && cd ..

# Run on connected iPhone
npx expo run:ios --device
```

## Step 8: Code Signing

In Xcode:
1. Signing & Capabilities → select your Team (Apple Developer account)
2. Bundle Identifier: `io.dappily.translator`
3. Automatic signing should handle provisioning profiles

## Key Differences from Android

| Feature | Android | iOS |
|---------|---------|-----|
| Whisper compile | CMake → NDK → .so | Xcode → .o (or framework) |
| GPU accel | None (CPU only) | Metal via ggml-metal ⚡️ |
| Mic API | AudioRecord (Java) | AVAudioEngine (Swift) |
| TTS | Android TTS engine | AVSpeechSynthesizer |
| Audio routing | AudioManager hacks | AVAudioSession (cleaner) |
| Model location | assets/ folder | App bundle Resources/ |

## iOS Advantages
- **Metal GPU acceleration** — Whisper runs FASTER on iPhone than Android because ggml-metal offloads to Apple's GPU
- **Better audio APIs** — AVAudioEngine is cleaner than Android's AudioRecord
- **Simpler audio routing** — AVAudioSession is less hacky than Android's AudioManager

## Troubleshooting

### "whisper.h not found"
→ Check Header Search Paths include the whisper.cpp/include directory

### "Model not found in bundle"
→ Verify ggml-tiny.bin is in "Copy Bundle Resources" build phase

### "Microphone permission denied"
→ app.json already includes NSMicrophoneUsageDescription. Rebuild after changes.

### Whisper hallucinating
→ Same as Android — the VAD threshold may need tuning for iPhone mic sensitivity.
iPhone mics are generally more sensitive, so you may want to raise SILENCE_THRESHOLD slightly.
