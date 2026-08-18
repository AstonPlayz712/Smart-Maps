//  SMPublicTypes.swift
//  The ONLY public value types in SMCore. These are data, not interfaces:
//  they are what SMNavigationController hands back. Every engine, adapter and
//  renderer behind them is internal to this module and unreachable from the
//  app target.

import Foundation
import CoreLocation

// MARK: - Fidelity

public enum SMFidelityTier: String {
    case full        // iOS 27+  — DR v3, motion prediction, satellite, max geometry
    case satellite   // iOS 26   — DR v2, satellite awareness, high geometry
    case modern      // iOS 17+  — DR v2, standard geometry

    public var displayName: String {
        switch self {
        case .full: return "Full Mode"
        case .satellite: return "Satellite Mode"
        case .modern: return "Modern Mode"
        }
    }
}

// MARK: - Motion

public enum SMMotionState: String {
    case still, walking, driving, unknown
}

// MARK: - Positioning provenance

public enum SMPositionSource: String, CaseIterable {
    case gnss          // GPS / GNSS
    case wifi          // Wi-Fi positioning
    case cell          // cell positioning
    case deadReckoning // DR (v2/v3) carrying through an outage
}

/// How the engine is currently holding position.
public enum SMPositionLink: String {
    case none          // no fix yet
    case free          // fix, not matched to road geometry
    case snapped       // matched to the road graph
    case deadReckoned  // GNSS lost, advancing on IMU + geometry
}

// MARK: - Live State

/// SM's identity readout: what the engine knows, right now.
public struct SMLiveState {
    public let coordinate: CLLocationCoordinate2D?
    /// Horizontal accuracy, metres.
    public let accuracyM: Double
    public let speedMps: Double
    public let headingDeg: Double
    public let motion: SMMotionState
    /// Confidence in the current motion/position estimate, 0…1.
    public let confidence: Double
    /// Which positioning sources contributed to the current fix.
    public let activeSources: Set<SMPositionSource>
    public let link: SMPositionLink
    /// Engine update frequency, Hz.
    public let updateHz: Double
    /// Road the engine is matched to, when snapped.
    public let roadName: String?

    // Dimensional engine summary (3D–7D), kept intact and surfaced read-only.
    public let laneIndex: Int?          // 3D — lane geometry
    public let roadLevel: Int           // 3D — multi-level roads (0 = ground)
    public let predictedHeadingDeg: Double?  // 4D — motion prediction (Full Mode)
    public let environmentScore: Double // 5D — environment/context
    public let trafficLevel: Double     // 6D — 0 (clear) … 1 (jammed)
    public let satelliteQuality: Double // 7D — sky/satellite awareness, 0…1

    public let timestamp: Date
}

// MARK: - Destination + status

public struct SMDestination {
    public let coordinate: CLLocationCoordinate2D
    public let name: String?
    public init(coordinate: CLLocationCoordinate2D, name: String? = nil) {
        self.coordinate = coordinate
        self.name = name
    }
}

public struct SMRouteSummary {
    public let distanceRemainingM: Double
    public let etaSeconds: Double
    public let nextInstruction: String?
}

public enum SMEngineState: String {
    case idle, acquiring, navigating, stopped
}

/// Everything the host app is allowed to know about SM's internals.
public struct SMStatus {
    public let engineState: SMEngineState
    public let tier: SMFidelityTier
    public let tierDescription: String
    public let locationAuthorized: Bool
    public let motionAvailable: Bool
    public let metalAvailable: Bool
    public let deadReckoningVersion: String
    public let motionPredictionEnabled: Bool
    public let satelliteEngineEnabled: Bool
    public let route: SMRouteSummary?
}
