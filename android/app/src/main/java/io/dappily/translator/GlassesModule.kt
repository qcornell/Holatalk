package io.dappily.translator

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class GlassesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "GlassesModule"
    }

    @ReactMethod
    fun ping(promise: Promise) {
        try {
            promise.resolve("Pong from Android Native! 👓")
        } catch (e: Exception) {
            promise.reject("ERROR", e)
        }
    }
}
