package com.smartmaps.ae.core

import kotlin.math.pow

/**
 * A/E Dead Reckoning — IMU integration with drift clamping.
 *
 * When fusion has no fresh fix, position advances along the last snapped road
 * edge using the remembered speed, decayed by IMU activity (port of the TS
 * DeadReckoningEngine): an active IMU (tunnel driving) holds speed with a long
 * half-life; a quiet IMU kills it fast so a parked user never drifts.
 *
 * Drift clamping: DR only ever moves along road geometry (never free-space),
 * distance per outage is capped, and the first fresh fix afterwards snaps the
 * estimate back — DR error cannot accumulate across outages.
 */
class DeadReckoningEngine {

    private var speedMps = 0.0
    private var headingDeg = 0.0
    private var outageDistanceM = 0.0

    /** Hard clamp: max metres DR may advance in a single GNSS outage. */
    private val maxOutageDistanceM = 500.0
    private val quietHalfLifeS = 0.9
    private val activeHalfLifeS = 12.0

    /** Seed with every trusted fused fix so DR always starts from truth. */
    fun seed(speed: Double, heading: Double) {
        if (speed.isFinite() && speed >= 0) speedMps = speed
        if (heading.isFinite()) headingDeg = ((heading % 360.0) + 360.0) % 360.0
        outageDistanceM = 0.0
    }

    fun currentSpeedMps(): Double = speedMps

    fun reset() {
        speedMps = 0.0
        headingDeg = 0.0
        outageDistanceM = 0.0
    }

    /**
     * Advance from the last snap along its edge. Returns null when there is
     * no edge to advance along (DR never invents free-space movement).
     */
    fun advance(
        spatial: SpatialEngine,
        lastSnap: SnapResult?,
        imuActivity: Double,
        dtMs: Long
    ): SnapResult? {
        if (lastSnap == null || !lastSnap.onRoad) return null
        val dtS = dtMs.coerceAtLeast(0) / 1000.0

        // IMU-modulated exponential speed decay.
        val activity = imuActivity.coerceIn(0.0, 1.0)
        val halfLife = quietHalfLifeS + (activeHalfLifeS - quietHalfLifeS) * activity
        speedMps *= 0.5.pow(dtS / halfLife)
        if (speedMps < 0.05) speedMps = 0.0

        var stepM = speedMps * dtS
        // Drift clamp: budget per outage.
        if (outageDistanceM + stepM > maxOutageDistanceM) {
            stepM = (maxOutageDistanceM - outageDistanceM).coerceAtLeast(0.0)
        }
        outageDistanceM += stepM

        val advanced = spatial.advanceAlongEdge(lastSnap.edgeId, lastSnap.edgeOffsetM, stepM)
            ?: return lastSnap
        headingDeg = advanced.headingDeg
        return advanced
    }
}
