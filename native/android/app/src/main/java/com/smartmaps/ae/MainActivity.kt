package com.smartmaps.ae

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.core.OfflineGeometryCache
import com.smartmaps.ae.sensors.SensorHub
import java.io.File

/**
 * MainActivity — boots the A/E core, wires the sensor hub, sets Compose
 * content. No WebView, no bridge, no plugins: this file and SensorHub are
 * the only places the Android platform is touched directly.
 */
class MainActivity : ComponentActivity() {

    private lateinit var core: AECore
    private lateinit var sensorHub: SensorHub

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            // Whatever was granted activates; whatever wasn't simply doesn't
            // report. The core keeps running either way.
            sensorHub.stop()
            sensorHub.start()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        core = AECore(
            cache = OfflineGeometryCache(File(filesDir, "geometry")),
            scope = lifecycleScope
        )
        sensorHub = SensorHub(this, core)

        core.start()
        sensorHub.start()
        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )

        setContent { SmartMapsApp(core) }
    }

    override fun onDestroy() {
        sensorHub.stop()
        core.stop()
        super.onDestroy()
    }
}
