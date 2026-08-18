//  SMDeadReckoning.swift
//  Two real DR implementations, selected by the fidelity profile:
//
//    DR v2  (iOS 26 / 17) — geometry-constrained: carries the last trusted
//                           speed along the matched road edge, decayed by IMU
//                           activity, hard-clamped per outage.
//    DR v3  (iOS 27)      — inertial: integrates CoreMotion user acceleration
//                           in the world frame to a velocity estimate, with
//                           zero-velocity updates, attitude-derived heading and
//                           geometry projection on top of the v2 clamp.
//
//  Both only ever advance along real road geometry — DR never invents
//  free-space movement.

import Foundation
import CoreLocation

struct SMDeadReckoningOutput {
    let snap: SnapResult
    let speedMps: Double
    let headingDeg: Double
    /// Accumulated uncertainty added by dead reckoning, metres.
    let driftM: Double
}

protocol SMDeadReckoningEngine: AnyObject {
    var versionName: String { get }
    /// Re-seed from a trusted fix. Called on every good GNSS update.
    func seed(speedMps: Double, headingDeg: Double)
    /// Advance one tick with no usable fix. Returns nil when there is no
    /// geometry to advance along.
    func advance(
        spatial: SpatialEngine,
        lastSnap: SnapResult?,
        motion: SMMotionAdapter,
        dt: TimeInterval
    ) -> SMDeadReckoningOutput?
    func reset()
}

// MARK: - DR v2 — geometry-constrained (iOS 26 / 17)

final class SMDeadReckoningV2: SMDeadReckoningEngine {

    let versionName = "DR v2"

    private var speedMps = 0.0
    private var headingDeg = 0.0
    private var outageDistanceM = 0.0

    private let maxOutageDistanceM = 500.0
    private let quietHalfLifeS = 0.9
    private let activeHalfLifeS = 12.0

    func seed(speedMps: Double, headingDeg: Double) {
        if speedMps.isFinite, speedMps >= 0 { self.speedMps = speedMps }
        if headingDeg.isFinite {
            self.headingDeg = (headingDeg.truncatingRemainder(dividingBy: 360) + 360)
                .truncatingRemainder(dividingBy: 360)
        }
        outageDistanceM = 0
    }

    func advance(
        spatial: SpatialEngine,
        lastSnap: SnapResult?,
        motion: SMMotionAdapter,
        dt: TimeInterval
    ) -> SMDeadReckoningOutput? {
        guard let lastSnap, lastSnap.onRoad else { return nil }

        // IMU-modulated exponential speed decay: an active IMU (tunnel driving)
        // holds speed; a quiet IMU kills it so a parked user never drifts.
        let activity = min(1, max(0, motion.imuActivity))
        let halfLife = quietHalfLifeS + (activeHalfLifeS - quietHalfLifeS) * activity
        speedMps *= pow(0.5, dt / halfLife)
        if speedMps < 0.05 { speedMps = 0 }

        var step = speedMps * dt
        if outageDistanceM + step > maxOutageDistanceM {
            step = max(0, maxOutageDistanceM - outageDistanceM)
        }
        outageDistanceM += step

        guard let advanced = spatial.advanceAlongEdge(
            edgeId: lastSnap.edgeId, offsetM: lastSnap.edgeOffsetM, distM: step
        ) else { return nil }

        headingDeg = advanced.headingDeg
        return SMDeadReckoningOutput(
            snap: advanced,
            speedMps: speedMps,
            headingDeg: headingDeg,
            driftM: outageDistanceM * 0.08   // ~8% of distance travelled blind
        )
    }

    func reset() {
        speedMps = 0
        headingDeg = 0
        outageDistanceM = 0
    }
}

// MARK: - DR v3 — inertial integration (iOS 27, Full Mode)

final class SMDeadReckoningV3: SMDeadReckoningEngine {

    let versionName = "DR v3"

    /// World-frame velocity estimate, m/s.
    private var velocity = SIMD2<Double>(0, 0)
    private var headingDeg = 0.0
    private var outageDistanceM = 0.0
    private var stationarySeconds = 0.0

    private let maxOutageDistanceM = 800.0     // v3 is trusted further than v2
    private let zuptThreshold = 0.12           // m/s² — below this, treat as still
    private let zuptHoldSeconds = 0.35
    private let velocityDamping = 0.985        // bleeds integration bias per tick

    func seed(speedMps: Double, headingDeg: Double) {
        guard speedMps.isFinite, headingDeg.isFinite else { return }
        let rad = headingDeg * .pi / 180
        velocity = SIMD2(sin(rad) * speedMps, cos(rad) * speedMps)
        self.headingDeg = (headingDeg.truncatingRemainder(dividingBy: 360) + 360)
            .truncatingRemainder(dividingBy: 360)
        outageDistanceM = 0
        stationarySeconds = 0
    }

    func advance(
        spatial: SpatialEngine,
        lastSnap: SnapResult?,
        motion: SMMotionAdapter,
        dt: TimeInterval
    ) -> SMDeadReckoningOutput? {
        guard let lastSnap, lastSnap.onRoad else { return nil }
        guard let sample = motion.latestSample else { return nil }

        // Attitude yaw carries heading while GNSS course is unavailable.
        if sample.yawDeg.isFinite { headingDeg = sample.yawDeg }

        // Longitudinal acceleration in the travel direction (m/s²).
        let accel = sample.accelMagnitude
        let signedAccel = sample.userAcceleration.y * 9.81   // device-forward axis

        // Zero-velocity update: sustained quiet IMU means genuinely stopped, so
        // collapse the velocity estimate instead of integrating noise forever.
        if accel < zuptThreshold {
            stationarySeconds += dt
            if stationarySeconds >= zuptHoldSeconds {
                velocity = SIMD2(0, 0)
            }
        } else {
            stationarySeconds = 0
            let rad = headingDeg * .pi / 180
            let direction = SIMD2(sin(rad), cos(rad))
            velocity += direction * (signedAccel * dt)
            velocity *= velocityDamping
        }

        let speed = max(0, min(90, sqrt(velocity.x * velocity.x + velocity.y * velocity.y)))
        var step = speed * dt
        if outageDistanceM + step > maxOutageDistanceM {
            step = max(0, maxOutageDistanceM - outageDistanceM)
        }
        outageDistanceM += step

        // The integrated motion is then projected onto real road geometry —
        // inertial estimate proposes, geometry constrains.
        guard let advanced = spatial.advanceAlongEdge(
            edgeId: lastSnap.edgeId, offsetM: lastSnap.edgeOffsetM, distM: step
        ) else { return nil }

        return SMDeadReckoningOutput(
            snap: advanced,
            speedMps: speed,
            headingDeg: advanced.headingDeg,
            driftM: outageDistanceM * 0.04   // tighter than v2 thanks to ZUPT
        )
    }

    func reset() {
        velocity = SIMD2(0, 0)
        headingDeg = 0
        outageDistanceM = 0
        stationarySeconds = 0
    }
}
