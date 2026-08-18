//  SMDimensionalEngine.swift
//  SM's 3D–7D engine, intact and native:
//
//    3D  geometry     — road graph, lane geometry, multi-level decks
//    4D  motion       — motion state, speed, heading, prediction (Full Mode)
//    5D  environment  — sky/context quality, tunnel, canyon, time of day
//    6D  traffic      — congestion derived from observed flow
//    7D  satellite    — satellite/sky awareness (iOS 27 / 26)
//
//  Each layer is computed every tick from live sensor state. Nothing here is
//  pre-baked; the layers exist on every tier, but their *detail* scales with
//  the fidelity profile.

import Foundation
import CoreLocation

struct SMDimensional3D {
    let snap: SnapResult?
    let lanes: SMLaneGeometryResult
    let roadLevel: SMRoadLevelResult
    let roadName: String?
}

struct SMDimensional4D {
    let motion: SMMotionEstimate
    let speedMps: Double
    let headingDeg: Double
    let prediction: SMMotionPrediction?
}

struct SMDimensional5D {
    /// Composite environment quality, 0…1 (sky + geometry certainty).
    let score: Double
    let inTunnel: Bool
    let urbanCanyon: Bool
    let isNight: Bool
}

struct SMDimensional6D {
    let traffic: SMTrafficState
}

struct SMDimensional7D {
    let satellite: SMSatelliteState
    let enabled: Bool
}

struct SMDimensionalState {
    let d3: SMDimensional3D
    let d4: SMDimensional4D
    let d5: SMDimensional5D
    let d6: SMDimensional6D
    let d7: SMDimensional7D
}

final class SMDimensionalEngine {

    private let profile: SMFidelityProfile
    private let laneEngine: SMLaneGeometryEngine
    private let levelEngine: SMMultiLevelRoadEngine
    private let satelliteEngine: SMSatelliteEngine
    private let trafficEngine: SMTrafficEngine

    init(profile: SMFidelityProfile) {
        self.profile = profile
        self.laneEngine = SMLaneGeometryEngine(profile: profile)
        self.levelEngine = SMMultiLevelRoadEngine(profile: profile)
        self.satelliteEngine = SMSatelliteEngine(profile: profile)
        self.trafficEngine = SMTrafficEngine()
    }

    func reset() {
        levelEngine.reset()
        satelliteEngine.reset()
        trafficEngine.reset()
    }

    func update(
        snap: SnapResult?,
        graph: RoadGraph,
        fix: SMRawFix?,
        motion: SMMotionEstimate,
        speedMps: Double,
        headingDeg: Double,
        prediction: SMMotionPrediction?,
        gnssLost: Bool,
        dt: TimeInterval,
        now: Date = Date()
    ) -> SMDimensionalState {

        // ── 7D satellite (drives 5D environment) ─────────────────────────
        let satellite = satelliteEngine.update(fix: fix, now: now)

        // ── 3D geometry ──────────────────────────────────────────────────
        let lanes = laneEngine.resolve(
            snap: snap, graph: graph, headingDeg: headingDeg, prediction: prediction
        )
        let level = levelEngine.resolve(
            altitude: fix?.altitude ?? 0,
            verticalAccuracyM: fix?.verticalAccuracyM ?? -1,
            gnssLost: gnssLost,
            motionState: motion.state
        )
        let roadName = snap.flatMap { s in graph.edges.first(where: { $0.id == s.edgeId })?.name }

        // ── 6D traffic ───────────────────────────────────────────────────
        let traffic = trafficEngine.update(
            snap: snap, graph: graph, speedMps: speedMps,
            motionState: motion.state, dt: dt
        )

        // ── 5D environment ───────────────────────────────────────────────
        let hour = Calendar.current.component(.hour, from: now)
        let isNight = hour < 6 || hour >= 20
        let geometryCertainty = snap?.onRoad == true ? 1.0 : 0.4
        let skyComponent = profile.satelliteEngineEnabled ? satellite.skyQuality : (gnssLost ? 0.2 : 0.8)
        let environmentScore = max(0, min(1, 0.5 * skyComponent + 0.3 * geometryCertainty + 0.2 * motion.confidence))

        return SMDimensionalState(
            d3: SMDimensional3D(snap: snap, lanes: lanes, roadLevel: level, roadName: roadName),
            d4: SMDimensional4D(motion: motion, speedMps: speedMps, headingDeg: headingDeg, prediction: prediction),
            d5: SMDimensional5D(
                score: environmentScore,
                inTunnel: level.isTunnel,
                urbanCanyon: satellite.urbanCanyon,
                isNight: isNight
            ),
            d6: SMDimensional6D(traffic: traffic),
            d7: SMDimensional7D(satellite: satellite, enabled: profile.satelliteEngineEnabled)
        )
    }
}
