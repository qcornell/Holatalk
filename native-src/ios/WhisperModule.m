// WhisperModule.m — Objective-C bridge for React Native
// Exposes SwiftWhisperModule methods to JS under the name "GlassesModule"
// (matches Android module name so JS code works cross-platform)

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(GlassesModule, NSObject)

RCT_EXTERN_METHOD(preloadModel:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(ping:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(helloNative:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recordWakeCheck:(double)durationSeconds
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recordFixedAndTranscribe:(double)durationSeconds
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recordAndTranscribe:(int)durationSeconds
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recordAndTranscribeForMic:(int)durationSeconds
                  micMode:(NSString *)micMode
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
