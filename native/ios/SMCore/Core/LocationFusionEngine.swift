// LocationFusionEngine.swift — A/E Location Fusion.
//
// GPS + Wi-Fi + cell + BT + IMU gate: every raw fix from any source lands in
// ingest(); fuse() produces the single authoritative FusedFix per tick as an
// inverse-variance weighted blend of all sources inside their freshness
// window. Sources activate purely by providing data — no configuration, no
// fallback ladder. Semantics mirror the Kotlin engine exactly.

import Foundation

final class LocationFusionEngine {

    private var held: [FixSource: RawFix] = [:]
    private var lastFused: FusedFix?
    private var smoothedSpeed = 0.0
    private var smoothedHeading = 0.0
    private var headingInit = false

    private let freshnessMs: [FixSource: Int64] = [
        .gps: 3000, .wifi: 8000, .cell: 15000, .bluetooth: 6000
    ]

    init() {}

    func ingest(_ fix: RawFix) {
        guard fix.point.lat.isFinite, fix.point.lng.isFinite,
              fix.accuracyM > 0, fix.accuracyM.isFinite else { return }
        if let prev = held[fix.source], fix.timestampMs < prev.timestampMs { return }
        held[fix.source] = fix
    }

    func current() -> FusedFix? { lastFused }

    func reset() {
        held.removeAll()
        lastFused = nil
        smoothedSpeed = 0
        headingInit = false
    }

    func fuse(nowMs: Int64, movement: MovementEstimate, dtMs: Int64) -> FusedFix? {
        let fresh = held.filter { source, fix in
            nowMs - fix.timestampMs <= (freshnessMs[source] ?? 5000)
        }
        if fresh.isEmpty { return lastFused }

        // Inverse-variance weights, decayed by age within the window.
        var wSum = 0.0, lat = 0.0, lng = 0.0, accWeighted = 0.0
        var sources = Set<FixSource>()
        for (source, fix) in fresh {
            let age = Double(nowMs - fix.timestampMs)
            let window = Double(freshnessMs[source] ?? 5000)
            let ageFactor = max(0.1, 1.0 - age / window)
            let w = ageFactor / (fix.accuracyM * fix.accuracyM)
            wSum += w
            lat += fix.point.lat * w
            lng += fix.point.lng * w
            accWeighted += fix.accuracyM * w
            sources.insert(source)
        }
        var point = GeoPoint(lat: lat / wSum, lng: lng / wSum)
        let accuracy = accWeighted / wSum

        // IMU stillness gate: confidently still → anchor to the last fused
        // point so multi-source jitter can't wander a stationary user.
        if let prev = lastFused, movement.state == .still, movement.confidence > 0.6 {
            let anchor = 0.85 * movement.confidence
            point = GeoPoint(
                lat: prev.point.lat + (point.lat - prev.point.lat) * (1 - anchor),
                lng: prev.point.lng + (point.lng - prev.point.lng) * (1 - anchor)
            )
        }

        // Speed: best explicit source speed, else displacement-derived; smoothed.
        let explicitSpeed = fresh.values.compactMap(\.speedMps).max()
        var derivedSpeed: Double?
        if let prev = lastFused, dtMs > 0 {
            derivedSpeed = haversineM(prev.point, point) / (Double(dtMs) / 1000.0)
        }
        let rawSpeed = explicitSpeed ?? derivedSpeed ?? smoothedSpeed
        let k = 1 - exp(-Double(dtMs) / 800.0)
        smoothedSpeed += (max(0, rawSpeed) - smoothedSpeed) * k

        // Heading: explicit bearing when moving; positional bearing as backup.
        let explicitBearing = fresh.values.compactMap(\.bearingDeg).first
        var positional: Double?
        if let prev = lastFused, haversineM(prev.point, point) > 1.5 {
            positional = bearingDeg(prev.point, point)
        }
        let targetHeading: Double
        if let b = explicitBearing, smoothedSpeed > 1.0 {
            targetHeading = b
        } else if let p = positional {
            targetHeading = p
        } else {
            targetHeading = smoothedHeading
        }
        if !headingInit {
            smoothedHeading = targetHeading
            headingInit = true
        } else {
            smoothedHeading = (smoothedHeading +
                shortestAngleDeltaDeg(from: smoothedHeading, to: targetHeading) * k + 360)
                .truncatingRemainder(dividingBy: 360)
        }

        let fused = FusedFix(
            point: point,
            accuracyM: accuracy,
            speedMps: smoothedSpeed,
            headingDeg: smoothedHeading,
            sources: sources,
            timestampMs: nowMs
        )
        lastFused = fused
        return fused
    }
}
