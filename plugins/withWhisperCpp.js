/**
 * withHolaD2D — Expo Config Plugin
 *
 * 1. iOS permissions (mic, background audio, encryption flag)
 * 2. Adds AudioRouter native module (pure ObjC) — only handles AVAudioSession
 *    routing. TTS is done by expo-speech in JS.
 * 3. Uses withXcodeProject to ADD files to Xcode compile sources — this is why
 *    it wasn't working before! withDangerousMod only writes files to disk but
 *    doesn't register them with Xcode.
 *
 * v5 (2026-03-08): Fixed Xcode project inclusion. Simplified native module to
 * only do session routing (setOutputMode). expo-speech handles TTS.
 * Also: uses AllowBluetoothHFP instead of deprecated AllowBluetooth.
 */

const {
  withInfoPlist,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ─── Step 1: Info.plist permissions ───
function withPermissions(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSMicrophoneUsageDescription =
      'Hola D2D needs microphone access to listen and translate conversations in real-time.';
    if (!config.modResults.UIBackgroundModes) config.modResults.UIBackgroundModes = [];
    if (!config.modResults.UIBackgroundModes.includes('audio')) config.modResults.UIBackgroundModes.push('audio');
    config.modResults.ITSAppUsesNonExemptEncryption = false;
    return config;
  });
}

// ─── AudioRouter ObjC source code ───

const HEADER_CONTENT = `// AudioRouter.h — Minimal audio session routing for iOS
// Only handles AVAudioSession config. TTS is done by expo-speech in JS.

#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>

@interface AudioRouter : NSObject <RCTBridgeModule>
@end
`;

const IMPL_CONTENT = `// AudioRouter.m — iOS audio session routing (v5)
//
// Two modes:
//   "speaker" — force built-in speaker, exclude Bluetooth options
//   "ear"     — allow Bluetooth (Meta glasses), no speaker override
//
// Called from JS BEFORE expo-speech.speak() so the audio session is
// configured correctly before TTS starts.

#import "AudioRouter.h"
#import <React/RCTLog.h>

@implementation AudioRouter

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

// ════════════════════════════
// MARK: - Main API
// ════════════════════════════

RCT_EXPORT_METHOD(setOutputMode:(NSString *)mode
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSError *error = nil;

  // Log before state
  NSLog(@"[AudioRouter] setOutputMode: %@ — current outputs: %@", mode, [self outputsString]);

  // Step 1: Deactivate so category changes apply cleanly
  [session setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];

  if ([mode isEqualToString:@"speaker"]) {
    // ═══ LOUD MODE ═══
    // PlayAndRecord with DefaultToSpeaker ONLY — no Bluetooth options!
    // This tells iOS: "don't even consider BT as an output route"
    [session setCategory:AVAudioSessionCategoryPlayAndRecord
                    mode:AVAudioSessionModeDefault
                 options:AVAudioSessionCategoryOptionDefaultToSpeaker
                   error:&error];
    if (error) {
      NSLog(@"[AudioRouter] ❌ setCategory speaker failed: %@", error.localizedDescription);
      reject(@"AUDIO_ROUTE_ERROR", error.localizedDescription, error);
      return;
    }

    // Activate session
    [session setActive:YES error:&error];
    if (error) {
      NSLog(@"[AudioRouter] ❌ setActive failed: %@", error.localizedDescription);
      reject(@"AUDIO_ROUTE_ERROR", error.localizedDescription, error);
      return;
    }

    // Force speaker override (belt and suspenders)
    [session overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker error:&error];
    if (error) {
      NSLog(@"[AudioRouter] ⚠️ overrideOutputAudioPort failed (non-fatal): %@", error.localizedDescription);
    }

    NSLog(@"[AudioRouter] 🔊 SPEAKER mode active — outputs: %@", [self outputsString]);

  } else if ([mode isEqualToString:@"ear"]) {
    // ═══ EAR/BLUETOOTH MODE ═══
    // PlayAndRecord with Bluetooth options — iOS routes to Meta glasses
    [session setCategory:AVAudioSessionCategoryPlayAndRecord
                    mode:AVAudioSessionModeDefault
                 options:(AVAudioSessionCategoryOptionAllowBluetoothA2DP |
                          AVAudioSessionCategoryOptionAllowBluetoothHFP)
                   error:&error];
    if (error) {
      NSLog(@"[AudioRouter] ❌ setCategory ear failed: %@", error.localizedDescription);
      reject(@"AUDIO_ROUTE_ERROR", error.localizedDescription, error);
      return;
    }

    // Clear any speaker override
    [session overrideOutputAudioPort:AVAudioSessionPortOverrideNone error:nil];

    // Prefer BT input if available
    for (AVAudioSessionPortDescription *port in session.availableInputs) {
      if ([port.portType isEqualToString:AVAudioSessionPortBluetoothHFP] ||
          [port.portType isEqualToString:AVAudioSessionPortBluetoothA2DP] ||
          [port.portType isEqualToString:AVAudioSessionPortBluetoothLE]) {
        [session setPreferredInput:port error:nil];
        NSLog(@"[AudioRouter] 🎧 Preferred BT input: %@(%@)", port.portName, port.portType);
        break;
      }
    }

    // Activate session
    [session setActive:YES error:nil];

    NSLog(@"[AudioRouter] 🎧 EAR/BT mode active — outputs: %@", [self outputsString]);

  } else {
    reject(@"AUDIO_ROUTE_ERROR", [NSString stringWithFormat:@"Unknown mode: %@", mode], nil);
    return;
  }

  resolve(@YES);
}

// ════════════════════════════
// MARK: - Debug
// ════════════════════════════

RCT_EXPORT_METHOD(getCurrentRoute:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSMutableArray *outputs = [NSMutableArray array];
  for (AVAudioSessionPortDescription *port in session.currentRoute.outputs) {
    [outputs addObject:@{
      @"portType": port.portType,
      @"portName": port.portName
    }];
  }
  NSMutableArray *inputs = [NSMutableArray array];
  for (AVAudioSessionPortDescription *port in session.currentRoute.inputs) {
    [inputs addObject:@{
      @"portType": port.portType,
      @"portName": port.portName
    }];
  }

  NSMutableArray *btDevices = [NSMutableArray array];
  for (AVAudioSessionPortDescription *port in session.availableInputs) {
    if ([port.portType isEqualToString:AVAudioSessionPortBluetoothHFP] ||
        [port.portType isEqualToString:AVAudioSessionPortBluetoothA2DP] ||
        [port.portType isEqualToString:AVAudioSessionPortBluetoothLE]) {
      [btDevices addObject:@{
        @"portType": port.portType,
        @"portName": port.portName
      }];
    }
  }

  NSDictionary *result = @{
    @"outputs": outputs,
    @"inputs": inputs,
    @"bluetoothDevices": btDevices,
    @"category": session.category,
  };

  NSLog(@"[AudioRouter] Route: %@", result);
  resolve(result);
}

RCT_EXPORT_METHOD(isBluetoothConnected:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  AVAudioSession *session = [AVAudioSession sharedInstance];
  BOOL hasBT = NO;
  for (AVAudioSessionPortDescription *port in session.availableInputs) {
    if ([port.portType isEqualToString:AVAudioSessionPortBluetoothHFP] ||
        [port.portType isEqualToString:AVAudioSessionPortBluetoothA2DP] ||
        [port.portType isEqualToString:AVAudioSessionPortBluetoothLE]) {
      hasBT = YES;
      break;
    }
  }
  resolve(@(hasBT));
}

// ════════════════════════════
// MARK: - Helpers
// ════════════════════════════

- (NSString *)outputsString {
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSMutableArray *parts = [NSMutableArray array];
  for (AVAudioSessionPortDescription *port in session.currentRoute.outputs) {
    [parts addObject:[NSString stringWithFormat:@"%@(%@)", port.portName, port.portType]];
  }
  return parts.count > 0 ? [parts componentsJoinedByString:@", "] : @"(none)";
}

@end
`;

// ─── Step 1b: Copy ggml-tiny.bin into iOS bundle resources ───
// Metro asset bundling can corrupt/truncate large binary files.
// This copies the raw .bin directly into the Xcode bundle resources
// so it's accessible via NSBundle.mainBundle at runtime.
function withWhisperModel(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName = config.modRequest.projectName || 'HolaD2D';
      const iosAppDir = path.join(projectRoot, 'ios', appName);

      const src = path.join(projectRoot, 'assets', 'ggml-tiny.bin');
      const dst = path.join(iosAppDir, 'ggml-tiny.bin');

      if (fs.existsSync(src)) {
        // Copy model file to ios/<AppName>/ so it can be added to bundle
        fs.copyFileSync(src, dst);
        const size = fs.statSync(dst).size;
        console.log(`[withHolaD2D] Copied ggml-tiny.bin to ${iosAppDir} (${(size / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        console.warn('[withHolaD2D] WARNING: assets/ggml-tiny.bin not found at', src);
      }

      return config;
    },
  ]);
}

// Add ggml-tiny.bin to Xcode bundle resources (PBXResourcesBuildPhase)
function withWhisperModelXcode(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const appName = config.modRequest.projectName || 'HolaD2D';

    // Check if already added
    const hasModel = Object.values(project.hash.project.objects.PBXFileReference || {}).some(
      (ref) => typeof ref === 'object' && ref.path === 'ggml-tiny.bin'
    );

    if (!hasModel) {
      // Find the app group — try multiple lookup strategies
      let groupKey = project.findPBXGroupKey({ name: appName });
      if (!groupKey) groupKey = project.findPBXGroupKey({ path: appName });

      if (groupKey) {
        try {
          project.addResourceFile(
            `${appName}/ggml-tiny.bin`,
            { target: project.getFirstTarget().uuid },
            groupKey
          );
          console.log('[withHolaD2D] Added ggml-tiny.bin to Xcode bundle resources (with group)');
        } catch (e) {
          console.warn('[withHolaD2D] addResourceFile with group failed:', e.message, '— trying without group');
          // Fallback: add without group
          try {
            project.addResourceFile(
              `${appName}/ggml-tiny.bin`,
              { target: project.getFirstTarget().uuid }
            );
            console.log('[withHolaD2D] Added ggml-tiny.bin to Xcode bundle resources (no group)');
          } catch (e2) {
            console.warn('[withHolaD2D] addResourceFile fallback also failed:', e2.message, '— using build phase');
            // Last resort: manually add to Copy Bundle Resources build phase
            const target = project.getFirstTarget();
            const buildPhases = target.buildPhases || [];
            
            // Add file reference
            const fileRef = project.generateUuid();
            project.hash.project.objects.PBXFileReference[fileRef] = {
              isa: 'PBXFileReference',
              lastKnownFileType: 'compiled',
              path: 'ggml-tiny.bin',
              sourceTree: '"<group>"',
              name: '"ggml-tiny.bin"',
            };
            project.hash.project.objects.PBXFileReference[fileRef + '_comment'] = 'ggml-tiny.bin';

            // Add build file
            const buildFileUuid = project.generateUuid();
            project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
              isa: 'PBXBuildFile',
              fileRef: fileRef,
              fileRef_comment: 'ggml-tiny.bin',
            };
            project.hash.project.objects.PBXBuildFile[buildFileUuid + '_comment'] = 'ggml-tiny.bin in Resources';

            // Find Resources build phase and add
            const resourcesPhase = buildPhases.find(
              (p) => p.value && project.hash.project.objects.PBXResourcesBuildPhase[p.value]
            );
            if (resourcesPhase) {
              const phase = project.hash.project.objects.PBXResourcesBuildPhase[resourcesPhase.value];
              if (phase && phase.files) {
                phase.files.push({ value: buildFileUuid, comment: 'ggml-tiny.bin in Resources' });
              }
            }
            console.log('[withHolaD2D] Added ggml-tiny.bin via manual build phase injection');
          }
        }
      } else {
        console.warn('[withHolaD2D] Could not find PBX group for', appName, '— adding without group');
        try {
          project.addResourceFile(
            `${appName}/ggml-tiny.bin`,
            { target: project.getFirstTarget().uuid }
          );
          console.log('[withHolaD2D] Added ggml-tiny.bin to Xcode bundle resources (no group)');
        } catch (e) {
          console.error('[withHolaD2D] addResourceFile completely failed:', e.message);
        }
      }
    } else {
      console.log('[withHolaD2D] ggml-tiny.bin already in Xcode project');
    }

    return config;
  });
}

// ─── Step 2: Write ObjC files to disk ───
function withAudioRouterFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName = config.modRequest.projectName || 'HolaD2D';
      const iosAppDir = path.join(projectRoot, 'ios', appName);

      if (!fs.existsSync(iosAppDir)) {
        fs.mkdirSync(iosAppDir, { recursive: true });
      }

      fs.writeFileSync(path.join(iosAppDir, 'AudioRouter.h'), HEADER_CONTENT);
      fs.writeFileSync(path.join(iosAppDir, 'AudioRouter.m'), IMPL_CONTENT);

      // Clean up old files
      const oldFiles = [
        'HolaAudioRouter.h', 'HolaAudioRouter.m',
        'AudioRouterModule.h', 'AudioRouterModule.m', 'AudioRouterModule.swift',
      ];
      for (const f of oldFiles) {
        const p = path.join(iosAppDir, f);
        if (fs.existsSync(p)) { fs.unlinkSync(p); }
      }

      console.log('[withHolaD2D] Wrote AudioRouter.h + AudioRouter.m to', iosAppDir);
      return config;
    },
  ]);
}

// ─── Step 3: Add files to Xcode project compile sources ───
// THIS IS THE FIX — withDangerousMod only writes files, withXcodeProject
// actually registers them with Xcode so they get compiled.
function withAudioRouterXcodeProject(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const appName = config.modRequest.projectName || 'HolaD2D';

    // Find the main app target group
    const mainGroup = project.getFirstProject().firstProject.mainGroup;

    // Check if files are already added (idempotent)
    const hasAudioRouterM = Object.values(project.hash.project.objects.PBXBuildFile || {}).some(
      (f) => typeof f === 'object' && f.fileRef && 
        Object.values(project.hash.project.objects.PBXFileReference || {}).some(
          (ref) => typeof ref === 'object' && ref.path === 'AudioRouter.m'
        )
    );

    if (!hasAudioRouterM) {
      // Add AudioRouter.h and AudioRouter.m to the project
      project.addSourceFile(
        `${appName}/AudioRouter.m`,
        { target: project.getFirstTarget().uuid },
        project.findPBXGroupKey({ name: appName }) || project.findPBXGroupKey({ path: appName })
      );

      // Add header (not compiled, just for reference)
      project.addHeaderFile(
        `${appName}/AudioRouter.h`,
        {},
        project.findPBXGroupKey({ name: appName }) || project.findPBXGroupKey({ path: appName })
      );

      console.log('[withHolaD2D] Added AudioRouter.m + .h to Xcode project compile sources');
    } else {
      console.log('[withHolaD2D] AudioRouter already in Xcode project');
    }

    return config;
  });
}

// ─── Compose all plugins ───
function withHolaD2DConfig(config) {
  config = withPermissions(config);
  config = withWhisperModel(config);
  config = withWhisperModelXcode(config);
  config = withAudioRouterFiles(config);
  config = withAudioRouterXcodeProject(config);
  return config;
}

module.exports = withHolaD2DConfig;
