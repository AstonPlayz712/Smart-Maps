// Models.swift — shared data models for the A/E All-In-One Core.
//
// Mirrors the Android Kotlin models and the TS reference layer
// (src/logic/types.ts) so behaviour parity is checkable across platforms.
// Plain data only — engines exchange these and meet exclusively in AECore.

import Foundation

public struct GeoPoint: Equatable, Codable {
    public var lat: Double
    public var lng: Double
    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
    public static let earthRadiusM = 6_371_000.0
}

public func haversineM(_ a: GeoPoint, _ b: GeoPoint) -> Double {
    let dLat = (b.lat - a.lat) * .pi / 180
    let dLng = (b.lng - a.lng) * .pi / 180
    let la1 = a.lat * .pi / 180
    let la2 = b.lat * .pi / 180
    let h = sin(dLat / 2) * sin(dLat / 2) + cos(la1) * cos(la2) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * GeoPoint.earthRadiusM * asin(min(1, sqrt(h)))
}

public func bearingDeg(_ a: GeoPoint, _ b: GeoPoint) -> Double {
    let p1 = a.lat * .pi / 180
    let p2 = b.lat * .pi / 180
    let dl = (b.lng - a.lng) * .pi / 180
    let y = sin(dl) * cos(p2)
    let x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
    return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
}

/// Wrap so interpolation takes the short way around 0/360.
public func shortestAngleDeltaDeg(from: Double, to: Double) -> Double {
    ((to - from + 540).truncatingRemainder(dividingBy: 360)) - 180
}

// ─── Location fusion ─────────────────────────────────────────────────────────

public enum FixSource: String, Codable, CaseIterable {
    case gps, wifi, cell, bluetooth, fused, deadReckoning
}

public struct RawFix {
    public var point: GeoPoint
    public var accuracyM: Double
    public var speedMps: Double?
    public var bearingDeg: Double?
    public var source: FixSource
    public var timestampMs: Int64
    public init(point: GeoPoint, accuracyM: Double, speedMps: Double?, bearingDeg: Double?, source: FixSource, timestampMs: Int64) {
        self.point = point
        self.accuracyM = accuracyM
        self.speedMps = speedMps
        self.bearingDeg = bearingDeg
        self.source = source
        self.timestampMs = timestampMs
    }
}

public struct FusedFix {
    public var point: GeoPoint
    public var accuracyM: Double
    public var speedMps: Double
    public var headingDeg: Double
    public var sources: Set<FixSource>
    public var timestampMs: Int64
}

// ─── Movement ────────────────────────────────────────────────────────────────

public struct MotionSample {
    public var accelMagnitude: Double
    public var gyroMagnitude: Double
    public var timestampMs: Int64
    public init(accelMagnitude: Double, gyroMagnitude: Double, timestampMs: Int64) {
        self.accelMagnitude = accelMagnitude
        self.gyroMagnitude = gyroMagnitude
        self.timestampMs = timestampMs
    }
}

public enum MotionState { case still, walking, driving, unknown }

public struct MovementEstimate {
    public var state: MotionState
    public var confidence: Double
    public var imuActivity: Double
    public var timestampMs: Int64
}

// ─── Road graph / geometry ───────────────────────────────────────────────────

public struct RoadNode: Codable {
    public var id: String
    public var point: GeoPoint
    public init(id: String, point: GeoPoint) {
        self.id = id
        self.point = point
    }
}

public struct RoadEdge: Codable {
    public var id: String
    public var fromNodeId: String
    public var toNodeId: String
    public var path: [GeoPoint]
    public var lengthM: Double
    public var name: String?
    public var speedLimitMps: Double
    public var oneWay: Bool

    public init(id: String, fromNodeId: String, toNodeId: String, path: [GeoPoint], lengthM: Double,
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

public struct RoadGraph: Codable {
    public var nodes: [String: RoadNode]
    public var edges: [RoadEdge]

    public init(nodes: [String: RoadNode], edges: [RoadEdge]) {
        self.nodes = nodes
        self.edges = edges
    }

    public func edgesFrom(_ nodeId: String) -> [RoadEdge] {
        edges.filter { $0.fromNodeId == nodeId || (!$0.oneWay && $0.toNodeId == nodeId) }
    }

    public static let empty = RoadGraph(nodes: [:], edges: [])
}

public struct SnapResult {
    public var point: GeoPoint
    public var edgeId: String
    public var edgeOffsetM: Double
    public var lateralOffsetM: Double
    public var headingDeg: Double
    public var onRoad: Bool
}

// ─── Routing ─────────────────────────────────────────────────────────────────

public enum Turn {
    case depart, `continue`, slightLeft, left, sharpLeft, slightRight, right, sharpRight, uTurn, arrive
}

public struct RouteStep {
    public var turn: Turn
    public var instruction: String
    public var point: GeoPoint
    public var distanceM: Double
    public var etaS: Double
}

public struct Route {
    public var points: [GeoPoint]
    public var steps: [RouteStep]
    public var distanceM: Double
    public var etaS: Double
}

// ─── Transport ───────────────────────────────────────────────────────────────

public enum TransportMode: String, Codable { case bus, train, tube, tram, ferry }

public struct TransitStop {
    public var id: String
    public var name: String
    public var point: GeoPoint
    public var mode: TransportMode
    public init(id: String, name: String, point: GeoPoint, mode: TransportMode) {
        self.id = id
        self.name = name
        self.point = point
        self.mode = mode
    }
}

public struct TransitArrival: Identifiable {
    public var id: String { "\(stopId)-\(line)-\(expectedAtMs)" }
    public var stopId: String
    public var line: String
    public var destination: String
    public var mode: TransportMode
    public var expectedAtMs: Int64
    public var live: Bool
    public init(stopId: String, line: String, destination: String, mode: TransportMode, expectedAtMs: Int64, live: Bool) {
        self.stopId = stopId
        self.line = line
        self.destination = destination
        self.mode = mode
        self.expectedAtMs = expectedAtMs
        self.live = live
    }
}
