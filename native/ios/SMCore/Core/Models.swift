// Models.swift — shared data models for the A/E All-In-One Core.
//
// Mirrors the Android Kotlin models and the TS reference layer
// (src/logic/types.ts) so behaviour parity is checkable across platforms.
// Plain data only — engines exchange these and meet exclusively in AECore.

import Foundation

struct GeoPoint: Equatable, Codable {
    var lat: Double
    var lng: Double
    init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
    static let earthRadiusM = 6_371_000.0
}

func haversineM(_ a: GeoPoint, _ b: GeoPoint) -> Double {
    let dLat = (b.lat - a.lat) * .pi / 180
    let dLng = (b.lng - a.lng) * .pi / 180
    let la1 = a.lat * .pi / 180
    let la2 = b.lat * .pi / 180
    let h = sin(dLat / 2) * sin(dLat / 2) + cos(la1) * cos(la2) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * GeoPoint.earthRadiusM * asin(min(1, sqrt(h)))
}

func bearingDeg(_ a: GeoPoint, _ b: GeoPoint) -> Double {
    let p1 = a.lat * .pi / 180
    let p2 = b.lat * .pi / 180
    let dl = (b.lng - a.lng) * .pi / 180
    let y = sin(dl) * cos(p2)
    let x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
    return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
}

/// Wrap so interpolation takes the short way around 0/360.
func shortestAngleDeltaDeg(from: Double, to: Double) -> Double {
    ((to - from + 540).truncatingRemainder(dividingBy: 360)) - 180
}

// ─── Location fusion ─────────────────────────────────────────────────────────

enum FixSource: String, Codable, CaseIterable {
    case gps, wifi, cell, bluetooth, fused, deadReckoning
}

struct RawFix {
    var point: GeoPoint
    var accuracyM: Double
    var speedMps: Double?
    var bearingDeg: Double?
    var source: FixSource
    var timestampMs: Int64
    init(point: GeoPoint, accuracyM: Double, speedMps: Double?, bearingDeg: Double?, source: FixSource, timestampMs: Int64) {
        self.point = point
        self.accuracyM = accuracyM
        self.speedMps = speedMps
        self.bearingDeg = bearingDeg
        self.source = source
        self.timestampMs = timestampMs
    }
}

struct FusedFix {
    var point: GeoPoint
    var accuracyM: Double
    var speedMps: Double
    var headingDeg: Double
    var sources: Set<FixSource>
    var timestampMs: Int64
}

// ─── Movement ────────────────────────────────────────────────────────────────

struct MotionSample {
    var accelMagnitude: Double
    var gyroMagnitude: Double
    var timestampMs: Int64
    init(accelMagnitude: Double, gyroMagnitude: Double, timestampMs: Int64) {
        self.accelMagnitude = accelMagnitude
        self.gyroMagnitude = gyroMagnitude
        self.timestampMs = timestampMs
    }
}

enum MotionState { case still, walking, driving, unknown }

struct MovementEstimate {
    var state: MotionState
    var confidence: Double
    var imuActivity: Double
    var timestampMs: Int64
}

// ─── Road graph / geometry ───────────────────────────────────────────────────

struct RoadNode: Codable {
    var id: String
    var point: GeoPoint
    init(id: String, point: GeoPoint) {
        self.id = id
        self.point = point
    }
}

struct RoadEdge: Codable {
    var id: String
    var fromNodeId: String
    var toNodeId: String
    var path: [GeoPoint]
    var lengthM: Double
    var name: String?
    var speedLimitMps: Double
    var oneWay: Bool

    init(id: String, fromNodeId: String, toNodeId: String, path: [GeoPoint], lengthM: Double,
                name: String? = nil, speedLimitMps: Double = 13.4, oneWay: Bool = false) {
        self.id = id
        self.fromNodeId = fromNodeId
        self.toNodeId = toNodeId
        self.path = path
        self.lengthM = lengthM
        self.name = name
        self.speedLimitMps = speedLimitMps
        self.oneWay = oneWay
    }
}

struct RoadGraph: Codable {
    var nodes: [String: RoadNode]
    var edges: [RoadEdge]

    init(nodes: [String: RoadNode], edges: [RoadEdge]) {
        self.nodes = nodes
        self.edges = edges
    }

    func edgesFrom(_ nodeId: String) -> [RoadEdge] {
        edges.filter { $0.fromNodeId == nodeId || (!$0.oneWay && $0.toNodeId == nodeId) }
    }

    static let empty = RoadGraph(nodes: [:], edges: [])
}

struct SnapResult {
    var point: GeoPoint
    var edgeId: String
    var edgeOffsetM: Double
    var lateralOffsetM: Double
    var headingDeg: Double
    var onRoad: Bool
}

// ─── Routing ─────────────────────────────────────────────────────────────────

enum Turn {
    case depart, `continue`, slightLeft, left, sharpLeft, slightRight, right, sharpRight, uTurn, arrive
}

struct RouteStep {
    var turn: Turn
    var instruction: String
    var point: GeoPoint
    var distanceM: Double
    var etaS: Double
}

struct Route {
    var points: [GeoPoint]
    var steps: [RouteStep]
    var distanceM: Double
    var etaS: Double
}

// ─── Transport ───────────────────────────────────────────────────────────────

enum TransportMode: String, Codable { case bus, train, tube, tram, ferry }

struct TransitStop {
    var id: String
    var name: String
    var point: GeoPoint
    var mode: TransportMode
    init(id: String, name: String, point: GeoPoint, mode: TransportMode) {
        self.id = id
        self.name = name
        self.point = point
        self.mode = mode
    }
}

struct TransitArrival: Identifiable {
    var id: String { "\(stopId)-\(line)-\(expectedAtMs)" }
    var stopId: String
    var line: String
    var destination: String
    var mode: TransportMode
    var expectedAtMs: Int64
    var live: Bool
    init(stopId: String, line: String, destination: String, mode: TransportMode, expectedAtMs: Int64, live: Bool) {
        self.stopId = stopId
        self.line = line
        self.destination = destination
        self.mode = mode
        self.expectedAtMs = expectedAtMs
        self.live = live
    }
}
