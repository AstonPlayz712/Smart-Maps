package com.smartmaps.devshell

/**
 * Thin Kotlin → JNI surface for the DevShell native sandbox.
 *
 * Pair with devshell/android/app/src/main/cpp/devshell_jni.cpp. Symbols
 * are kept by proguard-rules.pro so R8 doesn't strip them in release.
 */
object NativeBridge {
    init {
        System.loadLibrary("devshell_native")
    }

    /** Returns a short identifier from the shared C++ renderer. */
    external fun getNativeGreeting(): String

    /** Forwards a string to logcat from native — round-trip proof. */
    external fun logFromNative(message: String)

    /** Schema version of the renderer surface — bumped when JNI signatures change. */
    external fun getRendererVersion(): Int
}
