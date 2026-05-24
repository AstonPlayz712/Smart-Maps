# Keep the JNI bridge — Kotlin → C++ symbol names must survive R8.
-keep class com.smartmaps.devshell.NativeBridge { *; }
