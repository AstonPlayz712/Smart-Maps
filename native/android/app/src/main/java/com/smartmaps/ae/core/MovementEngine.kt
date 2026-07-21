package com.smartmaps.ae.core

import kotlin.math.exp
import kotlin.math.min

/**
 * A/E Movement Engine — accelerometer + gyro with smoothing.
 *
 * Maintains a rolling window of IMU samples, computes motion energy (accel
 * variance) and classifies STILL / WALKING / DRIVING with sustained-evidence
 * hysteresis (port of the TS MotionConfidenceEngine semantics). The estimate
 * gates location fusion (stillness anchor) and dead reckoning (speed decay).
 */
class MovementEngine {

    private val windowMs = 2000L
    private val samples = ArrayDeque<MotionSample>()

    private var state = MotionState.UNKNOWN
    private var confidence = 0.0
    private var stillMs = 0L
    private var walkMs = 0L
    private var driveMs = 0L
    private var noDataMs = 0L
    private var lastEstimate = MovementEstimate(MotionState.UNKNOWN, 0.0, 0.0, 0L)

    fun push(sample: MotionSample) {
        if (!sample.accelMagnitude.isFinite()) return
        samples.addLast(sample)
        val cutoff = sample.timestampMs - windowMs
        while (samples.isNotEmpty() && samples.first().timestampMs < cutoff) {
            samples.removeFirst()
        }
    }

    fun current(): MovementEstimate = lastEstimate

    fun reset() {
        samples.clear()
        state = MotionState.UNKNOWN
        confidence = 0.0
        stillMs = 0; walkMs = 0; driveMs = 0; noDataMs = 0
    }

    /**
     * Advance one tick. [gnssSpeedMps] (nullable) is corroborating evidence
     * only — the IMU is the primary signal so classification survives GNSS
     * blackouts.
     */
    fun update(nowMs: Long, gnssSpeedMps: Double?, dtMs: Long): MovementEstimate {
        val newest = samples.lastOrNull()
        val hasImu = newest != null && nowMs - newest.timestampMs <= 3000L
        val variance = if (hasImu) accelVariance() else 0.0
        val gyro = if (hasImu) gyroMean() else 0.0
        val activity = clamp01(variance / 0.35)

        // ── sustained evidence accumulation ────────────────────────────────
        if (!hasImu && gnssSpeedMps == null) {
            noDataMs += dtMs
            stillMs = 0; walkMs = 0; driveMs = 0
        } else {
            noDataMs = 0
            val speed = gnssSpeedMps ?: -1.0
            when {
                // Driving: sustained vibration + (fast OR turning without steps)
                activity > 0.35 && (speed > 4.0 || (speed < 0 && gyro > 0.05 && variance < 1.2)) -> {
                    driveMs += dtMs; walkMs = 0; stillMs = 0
                }
                // Walking: strong periodic accel energy at low speed
                variance > 0.8 && (speed < 0 || speed < 3.0) -> {
                    walkMs += dtMs; driveMs = 0; stillMs = 0
                }
                // Still: quiet IMU and (no or near-zero speed)
                activity < 0.2 && (speed < 0 || speed < 0.6) -> {
                    stillMs += dtMs; walkMs = 0; driveMs = 0
                }
                else -> {
                    // Conflicting: decay all accumulators.
                    stillMs = maxOf(0, stillMs - dtMs)
                    walkMs = maxOf(0, walkMs - dtMs)
                    driveMs = maxOf(0, driveMs - dtMs)
                }
            }
        }

        // ── hysteretic state ───────────────────────────────────────────────
        when {
            noDataMs >= 4000 -> state = MotionState.UNKNOWN
            driveMs >= 1200 -> state = MotionState.DRIVING
            walkMs >= 1200 -> state = MotionState.WALKING
            stillMs >= 1500 -> state = MotionState.STILL
        }

        // ── smoothed confidence ────────────────────────────────────────────
        val target = when (state) {
            MotionState.UNKNOWN -> 0.0
            MotionState.STILL -> clamp01(0.4 + 0.6 * (1 - activity))
            MotionState.WALKING -> clamp01(0.3 + 0.7 * min(1.0, variance / 1.2))
            MotionState.DRIVING -> clamp01(0.35 + 0.65 * activity)
        }
        val k = 1 - exp(-dtMs / 600.0)
        confidence += (target - confidence) * k

        lastEstimate = MovementEstimate(state, clamp01(confidence), activity, nowMs)
        return lastEstimate
    }

    private fun accelVariance(): Double {
        val n = samples.size
        if (n < 2) return 0.0
        var mean = 0.0
        for (s in samples) mean += s.accelMagnitude
        mean /= n
        var v = 0.0
        for (s in samples) v += (s.accelMagnitude - mean) * (s.accelMagnitude - mean)
        return v / (n - 1)
    }

    private fun gyroMean(): Double {
        if (samples.isEmpty()) return 0.0
        var sum = 0.0
        for (s in samples) sum += s.gyroMagnitude
        return sum / samples.size
    }

    private fun clamp01(v: Double) = when {
        v < 0.0 -> 0.0
        v > 1.0 -> 1.0
        else -> v
    }
}
