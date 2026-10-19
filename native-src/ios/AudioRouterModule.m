// AudioRouterModule.m — DEPRECATED
//
// This file is intentionally empty. The AudioRouter native module is now
// injected by the Expo config plugin (plugins/withWhisperCpp.js) as pure ObjC
// into ios/<AppName>/AudioRouter.h + AudioRouter.m during prebuild.
//
// This old ObjC bridge (RCT_EXTERN_MODULE) pointed to a Swift implementation
// that no longer exists. Keeping it would cause the module to fail silently
// (no Swift class to back it) or cause duplicate symbol errors.
//
// DO NOT add any code here.
