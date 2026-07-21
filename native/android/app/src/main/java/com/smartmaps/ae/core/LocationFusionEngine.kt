package com.smartmaps.ae.core

import kotlin.math.exp
import kotlin.math.max

/**
 * A/E Location Fusion — GPS + Wi-Fi(network) + cell + BT + IMU gate.
 *
 * Every raw fix from any source lands in [ingest]; [fuse] produces the single
 * authoritative FusedFix per tick as an inverse-variance weighted blend of all
 * sources still inside their freshness window. Sources activate purely by
 * providing data — a provider that never reports simply never contributes
 * (no configuration, no fallback ladder, no "primary" source).
 *
 * The IMU gate: when MovementEngine says STILL with high confidence, position
 * jitter from weak sources is frozen out by heavily weighting the last fused
 * point — GPS wander in a pocket doesn't walk the marker.
 */
class LocationFusionEngine {

    private data class Held(val fix: RawFix)

    private val held = mutableMapOf<FixSource, Held>()
    private var lastFused: FusedFix? = null
    private var smoothedSpeed = 0.0
    private var smoothedHeading = 0.0
    private var headingInit = false

    /** Freshness windows per source, ms. Stale entries stop contributing. */
    private val freshnessMs = mapOf(
        FixSource.GPS to 3000L,
        FixSource.WIFI to 8000L,
        FixSource.CELL to 15000L,
        FixSource.BLUETOOTH to 6000L
    )

    fun ingest(fix: RawFix) {
        if (!fix.point.lat.isFinite() || !fix.point.lng.isFinite()) return
        if (fix.accuracyM <= 0 || !fix.accuracyM.isFinite()) return
        val prev = held[fix.source]
        if (prev != null && fix.timestampMs < prev.fix.timestampMs) return
        held[fix.source] = Held(fix)
    }

    fun current(): FusedFix? = lastFused

    fun reset() {
        held.clear()
        lastFused = null
        smoothedSpeed = 0.0
        headingInit = false
    }

    /**
     * Fuse all fresh sources at [nowMs]. Returns null only before any source
     * has ever reported.
     */
    fun fuse(nowMs: Long, movement: MovementEstimate, dtMs: Long): FusedFix? {
        val fresh = held.entries.filter { (source, h) ->
            nowMs - h.fix.timestampMs <= (freshnessMs[source] ?: 5000L)
        }
        if (fresh.isEmpty()) return lastFused

        // Inverse-variance weights, decayed by age within the window.
        var wSum = 0.0
        var lat = 0.0
        var lng = 0.0
        var accWeighted = 0.0
        val sources = mutableSetOf<FixSource>()
        for ((source, h) in fresh) {
            val ageMs = (nowMs - h.fix.timestampMs).toDouble()
            val window = (freshnessMs[source] ?: 5000L).toDouble()
            val ageFactor = max(0.1, 1.0 - ageMs / window)
            val w = ageFactor / (h.fix.accuracyM * h.fix.accuracyM)
            wSum += w
            lat += h.fix.point.lat * w
            lng += h.fix.point.lng * w
            accWeighted += h.fix.accuracyM * w
            sources += source
        }
        var point = GeoPoint(lat / wSum, lng / wSum)
        var accuracy = accWeighted / wSum

        // IMU stillness gate: confidently STILL → anchor to the last fused
        // point so multi-source jitter can't wander a stationary user.
        val prev = lastFused
        if (prev != null && movement.state == MotionState.STILL && movement.confidence > 0.6) {
            val anchor = 0.85 * movement.confidence
            point = GeoPoint(
                prev.point.lat + (point.lat - prev.point.lat) * (1 - anchor),
                prev.point.lng + (point.lng - prev.point.lng) * (1 - anchor)
            )
        }

        // Speed: best explicit speed among fresh sources (GPS wins by weight),
        // else derived from fused displacement; smoothed exponentially.
        val explicitSpeed = fresh.mapNotNull { it.value.fix.speedMps }.maxOrNull()
        val derivedSpeed = if (prev != null && dtMs > 0) {
            haversineM(prev.point, point) / (dtMs / 1000.0)
        } else null
        val rawSpeed = explicitSpeed ?: derivedSpeed ?: smoothedSpeed
        val k = 1 - exp(-dtMs / 800.0)
        smoothedSpeed += (max(0.0, rawSpeed) - smoothedSpeed) * k

        // Heading: explicit bearing when moving; positional bearing as backup.
        val explicitBearing = fresh.mapNotNull { it.value.fix.bearingDeg }.firstOrNull()
        val positional = if (prev != null && haversineM(prev.point, point) > 1.5) {
            bearingDeg(prev.point, point)
        } else null
        val targetHeading = when {
            explicitBearing != null && smoothedSpeed > 1.0 -> explicitBearing
            positional != null -> positional
            else -> smoothedHeading
        }
        if (!headingInit) {
            smoothedHeading = targetHeading
            headingInit = true
        } else {
            smoothedHeading = (smoothedHeading +
                shortestAngleDeltaDeg(smoothedHeading, targetHeading) * k + 360.0) % 360.0
        }

        val fused = FusedFix(
            point = point,
            accuracyM = accuracy,
            speedMps = smoothedSpeed,
            headingDeg = smoothedHeading,
            sources = sources,
            timestampMs = nowMs
        )
        lastFused = fused
        return fused
    }
}
