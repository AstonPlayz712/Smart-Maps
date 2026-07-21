// MovementEngine.swift — A/E Movement Engine.
//
// Accelerometer + gyro with smoothing: rolling IMU window → motion energy →
// STILL / WALKING / DRIVING classification with sustained-evidence hysteresis.
// Mirrors the Kotlin engine and the TS MotionConfidenceEngine semantics.

import Foundation

public final class MovementEngine {

    private let windowMs: Int64 = 2000
    private var samples: [MotionSample] = []

    private var state: MotionState = .unknown
    private var confidence = 0.0
    private var stillMs: Int64 = 0
    private var walkMs: Int64 = 0
    private var driveMs: Int64 = 0
    private var noDataMs: Int64 = 0
    private var lastEstimate = MovementEstimate(state: .unknown, confidence: 0, imuActivity: 0, timestampMs: 0)

    public init() {}

    public func push(_ sample: MotionSample) {
        guard sample.accelMagnitude.isFinite else { return }
        samples.append(sample)
        let cutoff = sample.timestampMs - windowMs
        samples.removeAll { $0.timestampMs < cutoff }
    }

    public func current() -> MovementEstimate { lastEstimate }

    public func reset() {
        samples.removeAll()
        state = .unknown
        confidence = 0
        stillMs = 0; walkMs = 0; driveMs = 0; noDataMs = 0
    }

    public func update(nowMs: Int64, gnssSpeedMps: Double?, dtMs: Int64) -> MovementEstimate {
        let hasImu = samples.last.map { nowMs - $0.timestampMs <= 3000 } ?? false
        let variance = hasImu ? accelVariance() : 0
        let gyro = hasImu ? gyroMean() : 0
        let activity = clamp01(variance / 0.35)

        // ── sustained evidence accumulation ────────────────────────────────
        if !hasImu && gnssSpeedMps == nil {
            noDataMs += dtMs
            stillMs = 0; walkMs = 0; driveMs = 0
        } else {
            noDataMs = 0
            let speed = gnssSpeedMps ?? -1
            if activity > 0.35 && (speed > 4.0 || (speed < 0 && gyro > 0.05 && variance < 1.2)) {
                driveMs += dtMs; walkMs = 0; stillMs = 0
            } else if variance > 0.8 && (speed < 0 || speed < 3.0) {
                walkMs += dtMs; driveMs = 0; stillMs = 0
            } else if activity < 0.2 && (speed < 0 || speed < 0.6) {
                stillMs += dtMs; walkMs = 0; driveMs = 0
            } else {
                stillMs = max(0, stillMs - dtMs)
                walkMs = max(0, walkMs - dtMs)
                driveMs = max(0, driveMs - dtMs)
            }
        }

        // ── hysteretic state ───────────────────────────────────────────────
        if noDataMs >= 4000 { state = .unknown }
        else if driveMs >= 1200 { state = .driving }
        else if walkMs >= 1200 { state = .walking }
        else if stillMs >= 1500 { state = .still }

        // ── smoothed confidence ────────────────────────────────────────────
        let target: Double
        switch state {
        case .unknown: target = 0
        case .still: target = clamp01(0.4 + 0.6 * (1 - activity))
        case .walking: target = clamp01(0.3 + 0.7 * min(1.0, variance / 1.2))
        case .driving: target = clamp01(0.35 + 0.65 * activity)
        }
        let k = 1 - exp(-Double(dtMs) / 600.0)
        confidence += (target - confidence) * k

        lastEstimate = MovementEstimate(
            state: state, confidence: clamp01(confidence), imuActivity: activity, timestampMs: nowMs
        )
        return lastEstimate
    }

    private func accelVariance() -> Double {
        let n = samples.count
        guard n >= 2 else { return 0 }
        let mean = samples.reduce(0.0) { $0 + $1.accelMagnitude } / Double(n)
        let v = samples.reduce(0.0) { $0 + ($1.accelMagnitude - mean) * ($1.accelMagnitude - mean) }
        return v / Double(n - 1)
    }

    private func gyroMean() -> Double {
        guard !samples.isEmpty else { return 0 }
        return samples.reduce(0.0) { $0 + $1.gyroMagnitude } / Double(samples.count)
    }

    private func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }
}
