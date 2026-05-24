package com.smartmaps.devshell

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * DevShell launcher activity. Calls the native renderer, prints what it
 * returns, and rounds a Kotlin string trip back through C++ to logcat —
 * proves the JNI bridge end-to-end with zero magic in between.
 *
 * The real Auto-class work hangs off here: GLSurfaceView / SurfaceView,
 * Vulkan / GLES3, native tile pipeline. None of that ships to users.
 */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val greeting = findViewById<TextView>(R.id.greeting)
        val version = findViewById<TextView>(R.id.version)

        greeting.text = NativeBridge.getNativeGreeting()
        version.text = getString(R.string.renderer_version_fmt, NativeBridge.getRendererVersion())

        NativeBridge.logFromNative("Kotlin → C++ → logcat round-trip alive")
    }
}
