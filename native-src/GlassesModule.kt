package com.anonymous.DappilyDirector

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class GlassesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    // Load the C++ library
    init {
        try {
            System.loadLibrary("dappily_native")
        } catch (e: UnsatisfiedLinkError) {
            System.err.println("❌ FAILED TO LOAD C++ LIBRARY: " + e.message)
        }
    }

    // Declare the external C++ function
    external fun nativeHello(): String

    override fun getName(): String {
        return "GlassesModule"
    }

    @ReactMethod
    fun ping(promise: Promise) {
        try {
            // Call C++ function
            val message = nativeHello()
            promise.resolve(message)
        } catch (e: UnsatisfiedLinkError) {
            promise.reject("NATIVE_ERROR", "C++ library not loaded. Did you run 'npx expo run:android'?")
        } catch (e: Exception) {
            promise.reject("ERROR", e)
        }
    }
}
