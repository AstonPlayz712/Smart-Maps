//  SMSatelliteEngine.swift
//  7D satellite / sky awareness. Active on iOS 27 (Full) and iOS 26
//  (Satellite); the fidelity engine leaves it switched off on Modern Mode.
//
//  Apple exposes no raw GNSS constellation API, so SM infers sky quality from
//  the signals iOS *does* give: horizontal/vertical accuracy, their rate of
//  change, and outage behaviour. That is an honest proxy — it is derived from
//  real measurements, never fabricated.

import Foundation

struct SMSatelliteState {
    /// 0 (no sky / deep indoor) … 1 (open sky, tight fix).
    let skyQuality: Double
    /// True when accuracy is degrading in a pattern typical of urban canyon.
    let urbanCanyon: Bool
    /// True when GNSS has dropped out entirely.
    let outage: Bool
    /// Smoothed horizontal accuracy the engine is working with, metres.
    let effectiveAccuracyM: Double
}

final class SMSatelliteEngine {

    private let profile: SMFidelityProfile
    private var smoothedAccuracy: Double?
    private var accuracyTrend = 0.0
    private var lastFixTime: Date?

    init(profile: SMFidelityProfile) {
        self.profile = profile
    }

    var isEnabled: Bool { profile.satelliteEngineEnabled }

    func update(fix: SMRawFix?, now: Date = Date()) -> SMSatelliteState {
        guard profile.satelliteEngineEnabled else {
            return SMSatelliteState(skyQuality: 0, urbanCanyon: false, outage: false, effectiveAccuracyM: 0)
        }

        if let fix {
            let previous = smoothedAccuracy
            smoothedAccuracy = previous.map { $0 + (fix.accuracyM - $0) * 0.25 } ?? fix.accuracyM
            if let previous, let current = smoothedAccuracy {
                accuracyTrend += ((current - previous) - accuracyTrend) * 0.3
            }
            lastFixTime = fix.timestamp
        }

        let accuracy = smoothedAccuracy ?? 100
        let age = lastFixTime.map { now.timeIntervalSince($0) } ?? .greatestFiniteMagnitude
        let outage = age > 3.0

        // Tight, stable accuracy = open sky. Degrading accuracy while still
        // fixed = canyon. No fix at all = outage.
        let accuracyScore = max(0, min(1, (50 - accuracy) / 45))
        let stability = max(0, min(1, 1 - abs(accuracyTrend) / 8))
        let quality = outage ? 0 : accuracyScore * (0.6 + 0.4 * stability)

        return SMSatelliteState(
            skyQuality: quality,
            urbanCanyon: !outage && accuracy > 20 && accuracyTrend > 0.5,
            outage: outage,
            effectiveAccuracyM: accuracy
        )
    }

    func reset() {
        smoothedAccuracy = nil
        accuracyTrend = 0
        lastFixTime = nil
    }
}
