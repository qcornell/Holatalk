package io.dappily.translator

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class GlassesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        var nativeLoaded = false
        init {
            try {
                System.loadLibrary("dappily_native")
                nativeLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                nativeLoaded = false
            }
        }
    }

    override fun getName(): String = "GlassesModule"

    private external fun nativeHello(): String

    @ReactMethod
    fun ping(promise: Promise) {
        promise.resolve("pong from android native")
    }

    @ReactMethod
    fun helloFromCpp(promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("CPP_ERROR", "Native library failed to load")
            return
        }
        try {
            val result = nativeHello()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("CPP_ERROR", e.message)
        }
    }
}
