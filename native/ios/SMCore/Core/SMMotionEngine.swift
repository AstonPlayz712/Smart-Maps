//  SMMotionEngine.swift
//  Motion classification + (Full Mode only) short-horizon motion prediction.
//
//  The motion engine fuses three independent signals — Apple's own activity
//  classifier, raw IMU energy, and GNSS speed — with sustained-evidence
//  hysteresis, so a single noisy sample never flips the regime.

import Foundation
import CoreMotion

struct SMMotionEstimate {
    let state: SMMotionState
    let confidence: Double
    /// IMU motion energy, 0…1 — gates DR speed decay.
    let imuActivity: Double
}

final class SMMotionEngine {

    private var state: SMMotionState = .unknown
    private var confidence = 0.0
    private var stillMs = 0.0
    private var walkMs = 0.0
    private var driveMs = 0.0
    private var noDataMs = 0.0

    private(set) var latest = SMMotionEstimate(state: .unknown, confidence: 0, imuActivity: 0)

    func update(motion: SMMotionAdapter, gnssSpeedMps: Double?, dt: TimeInterval) -> SMMotionEstimate {
        let dtMs = dt * 1000
        let activity = motion.imuActivity
        let apple = motion.latestActivity
        let hasIMU = motion.latestSample != nil

        if !hasIMU && gnssSpeedMps == nil {
            noDataMs += dtMs
            stillMs = 0; walkMs = 0; driveMs = 0
        } else {
            noDataMs = 0
            let speed = gnssSpeedMps ?? -1

            // Apple's classifier is authoritative when it is confident; the raw
            // IMU + speed carry the decision when it is not.
            if apple.state != .unknown && apple.confidence >= 0.66 {
                switch apple.state {
                case .driving: driveMs += dtMs; walkMs = 0; stillMs = 0
                case .walking: walkMs += dtMs; driveMs = 0; stillMs = 0
                case .still: stillMs += dtMs; walkMs = 0; driveMs = 0
                case .unknown: break
                }
            } else if activity > 0.35 && (speed > 4.0 || (speed < 0 && activity > 0.5)) {
                driveMs += dtMs; walkMs = 0; stillMs = 0
            } else if activity > 0.5 && (speed < 0 || speed < 3.0) {
                walkMs += dtMs; driveMs = 0; stillMs = 0
            } else if activity < 0.2 && (speed < 0 || speed < 0.6) {
                stillMs += dtMs; walkMs = 0; driveMs = 0
            } else {
                stillMs = max(0, stillMs - dtMs)
                walkMs = max(0, walkMs - dtMs)
                driveMs = max(0, driveMs - dtMs)
            }
        }

        if noDataMs >= 4000 { state = .unknown }
        else if driveMs >= 1200 { state = .driving }
        else if walkMs >= 1200 { state = .walking }
        else if stillMs >= 1500 { state = .still }

        let target: Double
        switch state {
        case .unknown: target = 0
        case .still: target = min(1, 0.4 + 0.6 * (1 - activity))
        case .walking: target = min(1, 0.3 + 0.7 * activity)
        case .driving: target = min(1, 0.35 + 0.65 * max(activity, apple.confidence))
        }
        confidence += (target - confidence) * (1 - exp(-dt / 0.6))

        latest = SMMotionEstimate(
            state: state,
            confidence: min(1, max(0, confidence)),
            imuActivity: activity
        )
        return latest
    }

    func reset() {
        state = .unknown
        confidence = 0
        stillMs = 0; walkMs = 0; driveMs = 0; noDataMs = 0
    }
}

// MARK: - Motion prediction (iOS 27 / Full Mode only)

struct SMMotionPrediction {
    /// Predicted heading at the end of the horizon, degrees.
    let headingDeg: Double
    /// Predicted along-road distance travelled over the horizon, metres.
    let distanceM: Double
    /// Turn rate driving the prediction, degrees per second.
    let turnRateDegPerS: Double
    let horizon: TimeInterval
}

/// Short-horizon (0.5–3 s) prediction of where the vehicle will be pointing.
/// Feeds camera lead and lane pre-selection on Full Mode; never constructed on
/// lower tiers — the fidelity engine gates it.
final class SMMotionPredictor {

    private var smoothedTurnRate = 0.0

    func predict(
        motion: SMMotionAdapter,
        currentHeadingDeg: Double,
        speedMps: Double,
        horizon: TimeInterval = 2.0,
        dt: TimeInterval
    ) -> SMMotionPrediction? {
        guard let sample = motion.latestSample else { return nil }

        // Yaw rate about the gravity axis is the vehicle's turn rate.
        let yawRateDegPerS = sample.rotationRate.z * 180 / .pi
        smoothedTurnRate += (yawRateDegPerS - smoothedTurnRate) * (1 - exp(-dt / 0.4))

        let predictedHeading = (currentHeadingDeg + smoothedTurnRate * horizon + 360)
            .truncatingRemainder(dividingBy: 360)

        return SMMotionPrediction(
            headingDeg: predictedHeading,
            distanceM: speedMps * horizon,
            turnRateDegPerS: smoothedTurnRate,
            horizon: horizon
        )
    }

    func reset() { smoothedTurnRate = 0 }
}
