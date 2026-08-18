//  SMMultiLevelRoads.swift
//  Multi-level road resolution: which deck of a stacked road the vehicle is on
//  (surface street vs flyover vs tunnel). Uses barometric-free signals only —
//  GNSS altitude + vertical accuracy + the geometry graph — so it degrades
//  honestly rather than guessing.

import Foundation
import CoreLocation

struct SMRoadLevelResult {
    /// 0 = ground level, positive = elevated deck, negative = below grade.
    let level: Int
    /// Confidence in the level assignment, 0…1.
    let confidence: Double
    let isTunnel: Bool
    let isElevated: Bool
}

final class SMMultiLevelRoadEngine {

    private let profile: SMFidelityProfile
    private var smoothedAltitude: Double?
    private var groundReference: Double?

    init(profile: SMFidelityProfile) {
        self.profile = profile
    }

    /// Resolve the deck from the live fix. `gnssLost` is the strongest tunnel
    /// signal there is: sky-blocked positioning plus continuing IMU motion.
    func resolve(
        altitude: Double,
        verticalAccuracyM: Double,
        gnssLost: Bool,
        motionState: SMMotionState
    ) -> SMRoadLevelResult {
        // Standard detail does not attempt deck separation at all.
        guard profile.multiLevelRoadDetail >= .high else {
            return SMRoadLevelResult(level: 0, confidence: 0, isTunnel: false, isElevated: false)
        }

        // Smooth altitude; establish a rolling ground reference from settled
        // periods so relative deck height is meaningful.
        let alpha = 0.15
        smoothedAltitude = smoothedAltitude.map { $0 + (altitude - $0) * alpha } ?? altitude
        let smoothed = smoothedAltitude ?? altitude
        if groundReference == nil { groundReference = smoothed }
        if motionState == .still {
            groundReference = (groundReference ?? smoothed) * 0.9 + smoothed * 0.1
        }

        let delta = smoothed - (groundReference ?? smoothed)
        let trustworthy = verticalAccuracyM > 0 && verticalAccuracyM < 15

        let isTunnel = gnssLost && motionState == .driving
        var level = 0
        var confidence = 0.0

        if isTunnel {
            level = -1
            confidence = 0.7
        } else if trustworthy {
            // ~5 m per deck is the usual clearance for an urban flyover.
            level = Int((delta / 5.0).rounded())
            level = max(-2, min(3, level))
            confidence = min(1, max(0, (15 - verticalAccuracyM) / 15))
            // Maximum detail sharpens the threshold; high detail stays coarse.
            if profile.multiLevelRoadDetail == .high && abs(level) == 1 && confidence < 0.5 {
                level = 0
            }
        }

        return SMRoadLevelResult(
            level: level,
            confidence: confidence,
            isTunnel: isTunnel,
            isElevated: level > 0
        )
    }

    func reset() {
        smoothedAltitude = nil
        groundReference = nil
    }
}
