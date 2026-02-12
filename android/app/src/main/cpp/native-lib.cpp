#include <jni.h>
#include <string>

extern "C" JNIEXPORT jstring JNICALL
Java_io_dappily_translator_GlassesModule_nativeHello(
        JNIEnv* env,
        jobject /* this */) {
    std::string hello = "Hello from C++ (Texas Edition) 🤠";
    return env->NewStringUTF(hello.c_str());
}
