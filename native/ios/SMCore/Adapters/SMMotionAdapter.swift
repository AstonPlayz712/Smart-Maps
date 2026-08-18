//  SMMotionAdapter.swift
//  Binds SM to REAL CoreMotion. The only place in SMCore that talks to
//  CMMotionManager / CMMotionActivityManager.
//
//  Provides: accelerometer + gyro (via device motion, gravity removed),
//  Apple's own walking/driving classification, the DR input stream, and —
//  on Full Mode (iOS 27) only — the short-horizon motion prediction feed.

import Foundation
import CoreMotion

/// One fused IMU reading, gravity already removed by CoreMotion.
struct SMMotionSample {
    /// Linear acceleration magnitude (m/s²), gravity removed.
    let accelMagnitude: Double
    /// Raw user acceleration in the device frame (g), for DR v3 integration.
    let userAcceleration: CMAcceleration
    /// Rotation rate magnitude (rad/s).
    let gyroMagnitude: Double
    let rotationRate: CMRotationRate
    /// Device attitude yaw, degrees — DR heading when GNSS course is stale.
    let yawDeg: Double
    let timestamp: TimeInterval
}

/// Apple's activity classification, mapped to SM's motion vocabulary.
struct SMActivityClassification {
    let state: SMMotionState
    let confidence: Double
}

final class SMMotionAdapter {

    private let motionManager = CMMotionManager()
    private let activityManager = CMMotionActivityManager()
    private let profile: SMFidelityProfile

    private(set) var isAvailable = false
    private(set) var latestSample: SMMotionSample?
    private(set) var latestActivity = SMActivityClassification(state: .unknown, confidence: 0)

    /// Ring buffer of recent samples — DR and the predictor read this window.
    private(set) var window: [SMMotionSample] = []
    private let windowSeconds: TimeInterval = 2.0

    var onSample: ((SMMotionSample) -> Void)?

    init(profile: SMFidelityProfile) {
        self.profile = profile
    }

    // MARK: - Lifecycle

    func start() {
        guard motionManager.isDeviceMotionAvailable else {
            isAvailable = false
            return
        }
        isAvailable = true

        // Higher tiers sample the IMU faster: DR v3 and the 27-only predictor
        // both integrate over this stream.
        let hz: Double
        switch profile.tier {
        case .full: hz = 100
        case .satellite: hz = 60
        case .modern: hz = 50
        }
        motionManager.deviceMotionUpdateInterval = 1.0 / hz

        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let motion else { return }
            let a = motion.userAcceleration
            let r = motion.rotationRate
            let sample = SMMotionSample(
                accelMagnitude: sqrt(a.x * a.x + a.y * a.y + a.z * a.z) * 9.81,
                userAcceleration: a,
                gyroMagnitude: sqrt(r.x * r.x + r.y * r.y + r.z * r.z),
                rotationRate: r,
                yawDeg: (motion.attitude.yaw * 180 / .pi + 360).truncatingRemainder(dividingBy: 360),
                timestamp: motion.timestamp
            )
            self.ingest(sample)
        }

        // Apple's own walking / driving detection, when the user allows it.
        if CMMotionActivityManager.isActivityAvailable() {
            activityManager.startActivityUpdates(to: .main) { [weak self] activity in
                guard let self, let activity else { return }
                self.latestActivity = Self.classify(activity)
            }
        }
    }

    func stop() {
        motionManager.stopDeviceMotionUpdates()
        if CMMotionActivityManager.isActivityAvailable() {
            activityManager.stopActivityUpdates()
        }
        window.removeAll()
    }

    // MARK: - Stream

    private func ingest(_ sample: SMMotionSample) {
        latestSample = sample
        window.append(sample)
        let cutoff = sample.timestamp - windowSeconds
        window.removeAll { $0.timestamp < cutoff }
        onSample?(sample)
    }

    /// Motion energy over the window, 0…1 — the gate for DR speed decay.
    var imuActivity: Double {
        guard window.count >= 2 else { return 0 }
        let mean = window.reduce(0) { $0 + $1.accelMagnitude } / Double(window.count)
        let variance = window.reduce(0) { $0 + pow($1.accelMagnitude - mean, 2) } / Double(window.count - 1)
        return min(1, max(0, variance / 0.35))
    }

    // MARK: - Classification

    private static func classify(_ activity: CMMotionActivity) -> SMActivityClassification {
        let confidence: Double
        switch activity.confidence {
        case .high: confidence = 1.0
        case .medium: confidence = 0.66
        default: confidence = 0.33
        }
        let state: SMMotionState
        if activity.automotive {
            state = .driving
        } else if activity.walking || activity.running || activity.cycling {
            state = .walking
        } else if activity.stationary {
            state = .still
        } else {
            state = .unknown
        }
        return SMActivityClassification(state: state, confidence: confidence)
    }
}
