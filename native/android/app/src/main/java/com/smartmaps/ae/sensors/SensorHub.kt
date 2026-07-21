package com.smartmaps.ae.sensors

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.core.FixSource
import com.smartmaps.ae.core.GeoPoint
import com.smartmaps.ae.core.MotionSample
import com.smartmaps.ae.core.RawFix
import kotlin.math.sqrt

/**
 * SensorHub — the only place Android platform sensors are touched.
 *
 * Wires LocationManager (GPS + network/Wi-Fi providers) and SensorManager
 * (linear acceleration + gyroscope) directly into AECore. There are no
 * plugins and no bridges: platform callbacks push plain core models.
 *
 * Sources activate when their permission + hardware exist; a missing
 * provider simply never reports (the A/E "modules activate only when
 * implemented / available" rule at the sensor level).
 */
class SensorHub(private val context: Context, private val core: AECore) {

    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    private var lastGyro = 0.0
    private var started = false

    private val gpsListener = LocationListener { loc -> push(loc, FixSource.GPS) }
    private val networkListener = LocationListener { loc -> push(loc, FixSource.WIFI) }

    private val imuListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            when (event.sensor.type) {
                Sensor.TYPE_GYROSCOPE -> {
                    val (x, y, z) = event.values
                    lastGyro = sqrt((x * x + y * y + z * z).toDouble())
                }
                Sensor.TYPE_LINEAR_ACCELERATION -> {
                    val (x, y, z) = event.values
                    val magnitude = sqrt((x * x + y * y + z * z).toDouble())
                    core.pushMotion(
                        MotionSample(
                            accelMagnitude = magnitude,
                            gyroMagnitude = lastGyro,
                            timestampMs = System.currentTimeMillis()
                        )
                    )
                }
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    fun start() {
        if (started) return
        started = true

        // IMU: linear acceleration (gravity removed) + gyroscope at ~50 Hz.
        sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)?.let {
            sensorManager.registerListener(imuListener, it, SensorManager.SENSOR_DELAY_GAME)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)?.let {
            sensorManager.registerListener(imuListener, it, SensorManager.SENSOR_DELAY_GAME)
        }

        // Location: every available provider feeds fusion independently.
        if (hasLocationPermission()) {
            runCatching {
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER, 1000L, 0f, gpsListener, Looper.getMainLooper()
                    )
                }
            }
            runCatching {
                if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    locationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER, 2000L, 0f, networkListener, Looper.getMainLooper()
                    )
                }
            }
        }
    }

    fun stop() {
        if (!started) return
        started = false
        sensorManager.unregisterListener(imuListener)
        runCatching { locationManager.removeUpdates(gpsListener) }
        runCatching { locationManager.removeUpdates(networkListener) }
    }

    private fun push(location: Location, source: FixSource) {
        core.pushFix(
            RawFix(
                point = GeoPoint(location.latitude, location.longitude),
                accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else 50.0,
                speedMps = if (location.hasSpeed()) location.speed.toDouble() else null,
                bearingDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
                source = source,
                timestampMs = location.time.takeIf { it > 0 } ?: System.currentTimeMillis()
            )
        )
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
}
