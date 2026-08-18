//  SMFidelityScalingEngine.swift
//  Detects the host OS and derives the fidelity profile every other SM module
//  scales from. Internal — the app never sees it directly, it only reads the
//  resolved tier through SMStatus on the public interface.
//
//  Tiers
//    iOS 27+  → .full       DR v3, motion prediction, satellite, max geometry
//    iOS 26   → .satellite  DR v2, satellite awareness, high geometry
//    iOS 17+  → .modern     DR v2, no satellite, standard geometry
//
//  Tier selection deliberately uses ProcessInfo rather than `#available`:
//  the tier must resolve correctly at runtime on an OS newer than the SDK the
//  binary was compiled against. Individual *API* calls that need a newer SDK
//  are still guarded with `#available` at their call site, so this compiles on
//  any SDK from iOS 17 upward.

import Foundation

enum SMFidelityTierInternal: Int, Comparable {
    case modern = 17      // iOS 17 — Modern Mode
    case satellite = 26   // iOS 26 — Satellite Mode
    case full = 27        // iOS 27 — Full Mode

    static func < (lhs: SMFidelityTierInternal, rhs: SMFidelityTierInternal) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

enum SMDeadReckoningVersion { case v2, v3 }

enum SMDetailLevel: Int, Comparable {
    case standard = 0, high = 1, maximum = 2
    static func < (l: SMDetailLevel, r: SMDetailLevel) -> Bool { l.rawValue < r.rawValue }
}

enum SMRenderingFidelity: Int, Comparable {
    case standard = 0, high = 1, maximum = 2
    static func < (l: SMRenderingFidelity, r: SMRenderingFidelity) -> Bool { l.rawValue < r.rawValue }
}

/// The resolved capability set for this device+OS. Every engine reads its
/// behaviour from here rather than testing the OS version itself, so tier
/// policy lives in exactly one place.
struct SMFidelityProfile {
    let tier: SMFidelityTierInternal
    let osVersion: OperatingSystemVersion

    let deadReckoningVersion: SMDeadReckoningVersion
    let motionPredictionEnabled: Bool      // 27 only
    let satelliteEngineEnabled: Bool       // 27 + 26
    let laneGeometryDetail: SMDetailLevel
    let multiLevelRoadDetail: SMDetailLevel
    let renderingFidelity: SMRenderingFidelity

    /// Core tick rate — richer tiers run the engine loop faster.
    let tickInterval: TimeInterval
    /// Metal is attempted on every supported tier; SceneKit carries the
    /// scene-graph path. Both are real on 17+.
    let metalEnabled: Bool
    let sceneKitEnabled: Bool

    var displayName: String {
        switch tier {
        case .full: return "Full Mode (iOS 27+)"
        case .satellite: return "Satellite Mode (iOS 26)"
        case .modern: return "Modern Mode (iOS 17+)"
        }
    }
}

final class SMFidelityScalingEngine {

    let profile: SMFidelityProfile

    init(osVersion: OperatingSystemVersion = ProcessInfo.processInfo.operatingSystemVersion) {
        let tier = Self.tier(for: osVersion)
        self.profile = Self.profile(for: tier, osVersion: osVersion)
    }

    static func tier(for v: OperatingSystemVersion) -> SMFidelityTierInternal {
        switch v.majorVersion {
        case let major where major >= 27: return .full
        case 26: return .satellite
        default: return .modern   // deployment target is iOS 17, so this is the floor
        }
    }

    private static func profile(
        for tier: SMFidelityTierInternal,
        osVersion: OperatingSystemVersion
    ) -> SMFidelityProfile {
        switch tier {
        case .full:
            return SMFidelityProfile(
                tier: tier, osVersion: osVersion,
                deadReckoningVersion: .v3,
                motionPredictionEnabled: true,
                satelliteEngineEnabled: true,
                laneGeometryDetail: .maximum,
                multiLevelRoadDetail: .maximum,
                renderingFidelity: .maximum,
                tickInterval: 1.0 / 20.0,
                metalEnabled: true,
                sceneKitEnabled: true
            )
        case .satellite:
            return SMFidelityProfile(
                tier: tier, osVersion: osVersion,
                deadReckoningVersion: .v2,
                motionPredictionEnabled: false,
                satelliteEngineEnabled: true,
                laneGeometryDetail: .high,
                multiLevelRoadDetail: .high,
                renderingFidelity: .high,
                tickInterval: 1.0 / 15.0,
                metalEnabled: true,
                sceneKitEnabled: true
            )
        case .modern:
            return SMFidelityProfile(
                tier: tier, osVersion: osVersion,
                deadReckoningVersion: .v2,
                motionPredictionEnabled: false,
                satelliteEngineEnabled: false,
                laneGeometryDetail: .standard,
                multiLevelRoadDetail: .standard,
                renderingFidelity: .standard,
                tickInterval: 1.0 / 10.0,
                metalEnabled: true,
                sceneKitEnabled: true
            )
        }
    }
}
