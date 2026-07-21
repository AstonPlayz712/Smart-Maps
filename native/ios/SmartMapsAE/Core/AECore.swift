// AECore.swift — the A/E All-In-One orchestrator.
//
// Owns every engine and drives one dynamic tick loop. Engines only ever meet
// here; they never call each other. Modules activate purely by having data —
// no modes, no configuration, no fallback logic. SwiftUI observes the
// @Published state; it never reaches into an engine. Mirrors the Kotlin
// AECore tick pipeline exactly:
//
//   1. movement  ← IMU window (+ GNSS speed corroboration)
//   2. fused fix ← inverse-variance fusion of all fresh sources, IMU-gated
//   3. snap      ← road graph projection with hysteretic lock
//   4. DR        ← when no fresh fix: advance along the snapped edge
//   5. route     ← live remaining distance / ETA / next instruction
//   6. transit   ← provider board refresh around the fused position

import Foundation
import Combine

public final class AECore: ObservableObject {

    public let fusion = LocationFusionEngine()
    public let movement = MovementEngine()
    public let spatial = SpatialEngine()
    public let deadReckoning = DeadReckoningEngine()
    public let routing = RoutingEngine()
    public let transport = TransportTimeEngine()
    public let cache: OfflineGeometryCache

    // ── observable state (UI binds to these) ────────────────────────────────
    @Published public private(set) var fix: FusedFix?
    @Published public private(set) var snap: SnapResult?
    @Published public private(set) var movementState = MovementEstimate(
        state: .unknown, confidence: 0, imuActivity: 0, timestampMs: 0
    )
    @Published public private(set) var route: Route?
    @Published public private(set) var nextStep: RouteStep?
    @Published public private(set) var remainingM = 0.0
    @Published public private(set) var remainingEtaS = 0.0
    @Published public private(set) var arrivals: [TransitArrival] = []

    private var timer: Timer?
    private var lastTickMs: Int64 = 0
    private var lastGoodFixMs: Int64 = 0
    private let tickInterval: TimeInterval
    private let now: () -> Int64

    public init(
        cache: OfflineGeometryCache = OfflineGeometryCache(),
        tickInterval: TimeInterval = 0.2,
        now: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
    ) {
        self.cache = cache
        self.tickInterval = tickInterval
        self.now = now
    }

    // ── lifecycle ───────────────────────────────────────────────────────────

    public func start(graphKey: String = "default") {
        guard timer == nil else { return }
        if let graph = cache.load(key: graphKey) {
            spatial.setGraph(graph)
        }
        lastTickMs = now()
        timer = Timer.scheduledTimer(withTimeInterval: tickInterval, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// Install a road graph (e.g. freshly downloaded) — write-through cache.
    public func installGraph(key: String, graph: RoadGraph) {
        cache.save(key: key, graph: graph)
        spatial.setGraph(graph)
    }

    // ── sensor feeds (SensorHub pushes here) ────────────────────────────────

    public func pushFix(_ raw: RawFix) { fusion.ingest(raw) }

    public func pushMotion(_ sample: MotionSample) { movement.push(sample) }

    // ── routing ─────────────────────────────────────────────────────────────

    @discardableResult
    public func navigateTo(_ destination: GeoPoint, fromOverride: GeoPoint? = nil) -> Route? {
        guard let from = fromOverride ?? snap?.point ?? fix?.point else { return nil }
        let computed = routing.route(graph: spatial.graph(), from: from, to: destination)
        route = computed
        return computed
    }

    public func clearRoute() {
        route = nil
        nextStep = nil
        remainingM = 0
        remainingEtaS = 0
    }

    // ── the tick ────────────────────────────────────────────────────────────

    private func tick() {
        let nowMs = now()
        let dtMs = min(max(nowMs - lastTickMs, 1), 2000)
        lastTickMs = nowMs

        // 1. movement from IMU (+ GNSS speed corroboration)
        let gnssSpeed: Double? = {
            guard let f = fix, nowMs - f.timestampMs < 3000 else { return nil }
            return f.speedMps
        }()
        let move = movement.update(nowMs: nowMs, gnssSpeedMps: gnssSpeed, dtMs: dtMs)
        movementState = move

        // 2. fuse all fresh location sources
        let fused = fusion.fuse(nowMs: nowMs, movement: move, dtMs: dtMs)

        // 3–4. snap to road geometry, or dead-reckon through the outage
        if let fused {
            let snapped = spatial.snap(fused, dtMs: dtMs)
            if !fused.sources.isEmpty && fused.timestampMs > lastGoodFixMs {
                lastGoodFixMs = fused.timestampMs
            }
            let stale = nowMs - lastGoodFixMs > 3000
            if !stale, let snapped {
                snap = snapped
                var updated = fused
                updated.point = snapped.point
                updated.headingDeg = spatial.alignedHeading(fix: fused, snap: snapped)
                fix = updated
                deadReckoning.seed(speed: fused.speedMps, heading: fused.headingDeg)
            } else if let dr = deadReckoning.advance(
                spatial: spatial, lastSnap: snap, imuActivity: move.imuActivity, dtMs: dtMs
            ) {
                snap = dr
                fix = FusedFix(
                    point: dr.point,
                    accuracyM: (fix?.accuracyM ?? 20) + 0.5 * Double(dtMs) / 1000.0,
                    speedMps: deadReckoning.currentSpeedMps(),
                    headingDeg: dr.headingDeg,
                    sources: [.deadReckoning],
                    timestampMs: nowMs
                )
            } else if !fused.sources.isEmpty {
                fix = fused
                if let snapped { snap = snapped }
            }
        }

        // 5. live route progress + automatic arrival
        if let activeRoute = route, let position = fix?.point {
            let rem = routing.remaining(route: activeRoute, at: position)
            remainingM = rem.distM
            remainingEtaS = rem.etaS
            nextStep = routing.nextStep(route: activeRoute, at: position)
            if let end = activeRoute.points.last,
               haversineM(position, end) < 25, remainingM < 40 {
                clearRoute()
            }
        }

        // 6. transit board around the live position
        if let position = fix?.point {
            transport.refresh(center: position, nowMs: nowMs)
            arrivals = transport.allArrivals()
        }
    }
}
