// DeadReckoningEngine.swift — A/E Dead Reckoning: IMU integration + drift clamping.
//
// Advances along the last snapped road edge with the remembered speed,
// decayed by IMU activity (active IMU holds speed through tunnels, quiet IMU
// kills drift when parked). Hard-clamped per outage; only ever moves along
// road geometry. Mirrors the Kotlin engine.

import Foundation

public final class DeadReckoningEngine {

    private var speedMps = 0.0
    private var headingDeg = 0.0
    private var outageDistanceM = 0.0

    private let maxOutageDistanceM = 500.0
    private let quietHalfLifeS = 0.9
    private let activeHalfLifeS = 12.0

    public init() {}

    /// Seed with every trusted fused fix so DR always starts from truth.
    public func seed(speed: Double, heading: Double) {
        if speed.isFinite && speed >= 0 { speedMps = speed }
        if heading.isFinite {
            headingDeg = (heading.truncatingRemainder(dividingBy: 360) + 360)
                .truncatingRemainder(dividingBy: 360)
        }
        outageDistanceM = 0
    }

    public func currentSpeedMps() -> Double { speedMps }

    public func reset() {
        speedMps = 0
        headingDeg = 0
        outageDistanceM = 0
    }

    public func advance(
        spatial: SpatialEngine,
        lastSnap: SnapResult?,
        imuActivity: Double,
        dtMs: Int64
    ) -> SnapResult? {
        guard let lastSnap, lastSnap.onRoad else { return nil }
        let dtS = Double(max(dtMs, 0)) / 1000.0

        // IMU-modulated exponential speed decay.
        let activity = min(1, max(0, imuActivity))
        let halfLife = quietHalfLifeS + (activeHalfLifeS - quietHalfLifeS) * activity
        speedMps *= pow(0.5, dtS / halfLife)
        if speedMps < 0.05 { speedMps = 0 }

        var stepM = speedMps * dtS
        if outageDistanceM + stepM > maxOutageDistanceM {
            stepM = max(0, maxOutageDistanceM - outageDistanceM)
        }
        outageDistanceM += stepM

        guard let advanced = spatial.advanceAlongEdge(
            edgeId: lastSnap.edgeId, offsetM: lastSnap.edgeOffsetM, distM: stepM
        ) else { return lastSnap }
        headingDeg = advanced.headingDeg
        return advanced
    }
}
