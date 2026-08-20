//  SMCoreEngine.swift
//  The internal orchestrator. Owns every adapter and engine and drives one
//  tick loop; nothing outside SMCore can reach it. SMNavigationController is
//  the only door in.
//
//  Tick pipeline
//    1. motion         — CoreMotion → SMMotionEngine (+ predictor on Full Mode)
//    2. fusion         — CoreLocation fixes → LocationFusionEngine
//    3. geometry       — SpatialEngine snap onto the offline road graph
//    4. dead reckoning — DR v3 (27) / v2 (26/17) when GNSS is stale
//    5. dimensions     — the 3D–7D engine
//    6. live state     — the public readout
//    7. presentation   — SM's own map renderer + Metal/SceneKit

import Foundation
import CoreLocation

final class SMCoreEngine: SMLocationAdapterDelegate {

    let fidelity: SMFidelityScalingEngine
    var profile: SMFidelityProfile { fidelity.profile }

    // Adapters — real frameworks only
    let locationAdapter: SMLocationAdapter
    let motionAdapter: SMMotionAdapter
    let mapAdapter: SMMapAdapter
    let rendering: SMRenderingEngine

    // Engines
    private let fusion = LocationFusionEngine()
    private let spatial = SpatialEngine()
    private let routing = RoutingEngine()
    private let cache = OfflineGeometryCache()
    private let motionEngine = SMMotionEngine()
    private let predictor: SMMotionPredictor?
    private let deadReckoning: SMDeadReckoningEngine
    private let dimensional: SMDimensionalEngine

    // State
    private(set) var liveState: SMLiveState
    private(set) var engineState: SMEngineState = .idle
    private(set) var destination: SMDestination?
    private(set) var route: Route?
    private(set) var routeSummary: SMRouteSummary?
    private(set) var latestDimensions: SMDimensionalState?

    private var latestRawFix: SMRawFix?
    private var lastGoodFixTime: Date?
    private var lastSnap: SnapResult?
    private var timer: Timer?
    private var lastTick = Date()
    private var updateHz = 0.0

    var onUpdate: ((SMLiveState) -> Void)?

    // MARK: - Init

    init() {
        let fidelity = SMFidelityScalingEngine()
        self.fidelity = fidelity
        let profile = fidelity.profile

        self.locationAdapter = SMLocationAdapter(profile: profile)
        self.motionAdapter = SMMotionAdapter(profile: profile)
        self.mapAdapter = SMMapAdapter(profile: profile)
        self.rendering = SMRenderingEngine(profile: profile)
        self.dimensional = SMDimensionalEngine(profile: profile)

        // Fidelity selects the DR generation and whether prediction exists.
        switch profile.deadReckoningVersion {
        case .v3: self.deadReckoning = SMDeadReckoningV3()
        case .v2: self.deadReckoning = SMDeadReckoningV2()
        }
        self.predictor = profile.motionPredictionEnabled ? SMMotionPredictor() : nil

        self.liveState = SMLiveState(
            coordinate: nil, accuracyM: 0, speedMps: 0, headingDeg: 0,
            motion: .unknown, confidence: 0, activeSources: [], link: .none,
            updateHz: 0, roadName: nil, laneIndex: nil, roadLevel: 0,
            predictedHeadingDeg: nil, environmentScore: 0, trafficLevel: 0,
            satelliteQuality: 0, timestamp: Date()
        )

        locationAdapter.delegate = self
        if let graph = cache.load(key: "default") {
            spatial.setGraph(graph)
        }
        rendering.start()
    }

    // MARK: - Lifecycle

    func start() {
        guard timer == nil else { return }
        engineState = .acquiring
        locationAdapter.start()
        motionAdapter.start()
        lastTick = Date()
        let timer = Timer(timeInterval: profile.tickInterval, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        locationAdapter.stop()
        motionAdapter.stop()
        rendering.stop()
        deadReckoning.reset()
        motionEngine.reset()
        dimensional.reset()
        engineState = .stopped
    }

    func setDestination(_ destination: SMDestination?) {
        self.destination = destination
        mapAdapter.setDestination(destination)
        guard let destination, let from = liveState.coordinate else {
            route = nil
            routeSummary = nil
            mapAdapter.setRoute([])
            return
        }
        let computed = routing.route(
            graph: spatial.graph(),
            from: GeoPoint(from),
            to: GeoPoint(destination.coordinate)
        )
        route = computed
        mapAdapter.setRoute(computed?.points.map { $0.clCoordinate } ?? [])
        if computed != nil { engineState = .navigating }
    }

    func installGraph(_ graph: RoadGraph, key: String = "default") {
        cache.save(key: key, graph: graph)
        spatial.setGraph(graph)
    }

    // MARK: - SMLocationAdapterDelegate

    func locationAdapter(_ adapter: SMLocationAdapter, didUpdate fix: SMRawFix) {
        latestRawFix = fix
        lastGoodFixTime = fix.timestamp
        fusion.ingest(RawFix(
            point: GeoPoint(fix.coordinate),
            accuracyM: fix.accuracyM,
            speedMps: fix.speedMps,
            bearingDeg: fix.courseDeg ?? fix.headingDeg,
            source: Self.mapSource(fix.source),
            timestampMs: Int64(fix.timestamp.timeIntervalSince1970 * 1000)
        ))
    }

    func locationAdapter(_ adapter: SMLocationAdapter, didChangeAuthorization authorized: Bool) {
        if !authorized { engineState = .acquiring }
    }

    // MARK: - Tick

    private func tick() {
        let now = Date()
        let dt = max(0.001, min(2.0, now.timeIntervalSince(lastTick)))
        lastTick = now
        updateHz += (1.0 / dt - updateHz) * 0.2

        // 1. motion
        let gnssSpeed: Double? = {
            guard let fix = latestRawFix, now.timeIntervalSince(fix.timestamp) < 3 else { return nil }
            return fix.speedMps
        }()
        let motion = motionEngine.update(motion: motionAdapter, gnssSpeedMps: gnssSpeed, dt: dt)

        // 2. fusion
        let legacyMovement = MovementEstimate(
            state: Self.mapMotion(motion.state),
            confidence: motion.confidence,
            imuActivity: motion.imuActivity,
            timestampMs: Int64(now.timeIntervalSince1970 * 1000)
        )
        let fused = fusion.fuse(
            nowMs: Int64(now.timeIntervalSince1970 * 1000),
            movement: legacyMovement,
            dtMs: Int64(dt * 1000)
        )

        let gnssAge = lastGoodFixTime.map { now.timeIntervalSince($0) } ?? Double.greatestFiniteMagnitude
        let gnssLost = gnssAge > 3.0

        // 3–4. snap to geometry, or dead-reckon through the outage
        var link: SMPositionLink = .none
        var coordinate: CLLocationCoordinate2D?
        var speed = fused?.speedMps ?? 0
        var heading = fused?.headingDeg ?? 0
        var sources: Set<SMPositionSource> = []
        var accuracy = fused?.accuracyM ?? 0

        if let fused, !gnssLost {
            let snap = spatial.snap(fused, dtMs: Int64(dt * 1000))
            if snap != nil { lastSnap = snap }
            if let snap, snap.onRoad {
                coordinate = snap.point.clCoordinate
                heading = spatial.alignedHeading(fix: fused, snap: snap)
                link = .snapped
            } else {
                coordinate = fused.point.clCoordinate
                link = .free
            }
            sources = Set(fused.sources.compactMap(Self.mapSourceBack))
            deadReckoning.seed(speedMps: fused.speedMps, headingDeg: fused.headingDeg)
            if engineState == .acquiring { engineState = route == nil ? .idle : .navigating }
        } else if let dr = deadReckoning.advance(
            spatial: spatial, lastSnap: lastSnap, motion: motionAdapter, dt: dt
        ) {
            lastSnap = dr.snap
            coordinate = dr.snap.point.clCoordinate
            speed = dr.speedMps
            heading = dr.headingDeg
            accuracy = (fused?.accuracyM ?? 20) + dr.driftM
            link = .deadReckoned
            sources = [.deadReckoning]
        } else if let fused {
            coordinate = fused.point.clCoordinate
            link = .free
            sources = Set(fused.sources.compactMap(Self.mapSourceBack))
        }

        // 5. motion prediction — Full Mode only
        let prediction = predictor?.predict(
            motion: motionAdapter, currentHeadingDeg: heading, speedMps: speed, dt: dt
        )

        // 6. dimensions 3D–7D
        let dims = dimensional.update(
            snap: lastSnap, graph: spatial.graph(), fix: latestRawFix,
            motion: motion, speedMps: speed, headingDeg: heading,
            prediction: prediction, gnssLost: gnssLost, dt: dt, now: now
        )
        latestDimensions = dims

        // Route progress
        if let route, let coordinate {
            let remaining = routing.remaining(route: route, at: GeoPoint(coordinate))
            routeSummary = SMRouteSummary(
                distanceRemainingM: remaining.distM,
                etaSeconds: remaining.etaS,
                nextInstruction: routing.nextStep(route: route, at: GeoPoint(coordinate))?.instruction
            )
        } else {
            routeSummary = nil
        }

        // 7. live state
        liveState = SMLiveState(
            coordinate: coordinate,
            accuracyM: accuracy,
            speedMps: speed,
            headingDeg: heading,
            motion: motion.state,
            confidence: motion.confidence,
            activeSources: sources,
            link: link,
            updateHz: updateHz,
            roadName: dims.d3.roadName,
            laneIndex: dims.d3.lanes.currentLaneIndex,
            roadLevel: dims.d3.roadLevel.level,
            predictedHeadingDeg: prediction?.headingDeg,
            environmentScore: dims.d5.score,
            trafficLevel: dims.d6.traffic.level,
            satelliteQuality: dims.d7.satellite.skyQuality,
            timestamp: now
        )

        // 8. presentation — SM's own renderer (no MapKit)
        if let coordinate {
            mapAdapter.updateCamera(
                center: coordinate,
                headingDeg: prediction?.headingDeg ?? heading,
                distance: cameraDistance(for: speed),
                pitchDeg: cameraPitch(),
                animated: true
            )
            // The renderer needs the accuracy and floor to size the ring and
            // clip indoor layers — the same inputs the web renderer takes.
            mapAdapter.setPosition(
                coordinate,
                accuracyM: accuracy,
                verticalAccuracyM: dims.d3.roadLevel.confidence > 0 ? 3.0 : 0,
                floorLevel: dims.d3.roadLevel.level == 0 ? nil : dims.d3.roadLevel.level
            )
        }
        rendering.update(dimensions: dims, liveState: liveState)
        onUpdate?(liveState)
    }

    // MARK: - Camera model

    private func cameraDistance(for speed: Double) -> CLLocationDistance {
        let base: Double = profile.renderingFidelity == .maximum ? 380 : 320
        return base + min(700, speed * 26)
    }

    private func cameraPitch() -> Double {
        switch profile.renderingFidelity {
        case .maximum: return 60
        case .high: return 55
        case .standard: return 45
        }
    }

    // MARK: - Status

    func status() -> SMStatus {
        SMStatus(
            engineState: engineState,
            tier: Self.publicTier(profile.tier),
            tierDescription: profile.displayName,
            locationAuthorized: locationAdapter.isAuthorized,
            motionAvailable: motionAdapter.isAvailable,
            metalAvailable: rendering.metalAvailable,
            deadReckoningVersion: deadReckoning.versionName,
            motionPredictionEnabled: profile.motionPredictionEnabled,
            satelliteEngineEnabled: profile.satelliteEngineEnabled,
            route: routeSummary
        )
    }

    // MARK: - Mapping helpers

    static func publicTier(_ tier: SMFidelityTierInternal) -> SMFidelityTier {
        switch tier {
        case .full: return .full
        case .satellite: return .satellite
        case .modern: return .modern
        }
    }

    private static func mapSource(_ source: SMPositionSource) -> FixSource {
        switch source {
        case .gnss: return .gps
        case .wifi: return .wifi
        case .cell: return .cell
        case .deadReckoning: return .deadReckoning
        }
    }

    private static func mapSourceBack(_ source: FixSource) -> SMPositionSource? {
        switch source {
        case .gps: return .gnss
        case .wifi: return .wifi
        case .cell: return .cell
        case .deadReckoning: return .deadReckoning
        case .bluetooth, .fused: return nil
        }
    }

    private static func mapMotion(_ state: SMMotionState) -> MotionState {
        switch state {
        case .still: return .still
        case .walking: return .walking
        case .driving: return .driving
        case .unknown: return .unknown
        }
    }
}
