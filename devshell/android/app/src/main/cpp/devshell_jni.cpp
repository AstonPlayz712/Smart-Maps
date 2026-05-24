//
// JNI entry points for DevShell.
//
// Bridges Kotlin (NativeBridge) ↔ shared C++ renderer (devshell::Renderer
// in devshell/native/core). Auto-class native renderers / camera / tile
// pipeline experiments will hang off this file later.
//

#include <jni.h>
#include <android/log.h>
#include <string>

#include "renderer.h"

#define LOG_TAG "DevShellNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {
devshell::Renderer g_renderer;
}

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_smartmaps_devshell_NativeBridge_getNativeGreeting(JNIEnv *env, jobject /* this */) {
    const std::string msg = g_renderer.greeting();
    LOGI("greeting() -> %s", msg.c_str());
    return env->NewStringUTF(msg.c_str());
}

JNIEXPORT void JNICALL
Java_com_smartmaps_devshell_NativeBridge_logFromNative(JNIEnv *env, jobject /* this */, jstring jmsg) {
    const char *cmsg = env->GetStringUTFChars(jmsg, nullptr);
    if (cmsg != nullptr) {
        LOGI("kotlin: %s", cmsg);
        env->ReleaseStringUTFChars(jmsg, cmsg);
    }
}

JNIEXPORT jint JNICALL
Java_com_smartmaps_devshell_NativeBridge_getRendererVersion(JNIEnv * /* env */, jobject /* this */) {
    return static_cast<jint>(g_renderer.version());
}

}  // extern "C"
