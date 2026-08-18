// SpatialEngine.swift — A/E Spatial Engine: road snapping + geometry alignment.
//
// Local equirectangular projection onto the road graph, nearest-edge search
// with a hint window, hysteretic snap lock, and geometry-aligned heading.
// Port of the Kotlin SpatialEngine / TS RouteManager projection.

import Foundation

final class SpatialEngine {

    private struct LocalEdge {
        let edge: RoadEdge
        let xs: [Double]
        let ys: [Double]
        let cumM: [Double]
    }

    private struct Projection {
        let edge: RoadEdge
        let x: Double
        let y: Double
        let offsetM: Double
        let lateral: Double
        let headingDeg: Double
    }

    private var roadGraph: RoadGraph = .empty
    private var origin: GeoPoint?
    private var cosLat = 1.0
    private var locked = false
    private var unlockAccumMs: Int64 = 0
    private var hintEdge = -1
    private var localEdges: [LocalEdge] = []

    init() {}

    func setGraph(_ graph: RoadGraph) {
        roadGraph = graph
        hintEdge = -1
        locked = false
        unlockAccumMs = 0
        origin = graph.edges.first?.path.first
        cosLat = origin.map { cos($0.lat * .pi / 180) } ?? 1.0
        localEdges = graph.edges.map { edge in
            var xs: [Double] = [], ys: [Double] = [], cum: [Double] = []
            for (i, p) in edge.path.enumerated() {
                let l = toLocal(p)
                xs.append(l.x)
                ys.append(l.y)
                cum.append(i == 0 ? 0 : cum[i - 1] + hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
            }
            return LocalEdge(edge: edge, xs: xs, ys: ys, cumM: cum)
        }
    }

    func graph() -> RoadGraph { roadGraph }

    func isLocked() -> Bool { locked }

    func reset() {
        locked = false
        unlockAccumMs = 0
        hintEdge = -1
    }

    func snap(_ fix: FusedFix, dtMs: Int64) -> SnapResult? {
        guard !localEdges.isEmpty, origin != nil else { return nil }
        let local = toLocal(fix.point)

        var best: Projection? = hintEdge >= 0 && hintEdge < localEdges.count
            ? project(onto: localEdges[hintEdge], px: local.x, py: local.y)
            : nil
        if best == nil || best!.lateral > 120 {
            var bestAll: Projection?
            for i in localEdges.indices {
                guard let p = project(onto: localEdges[i], px: local.x, py: local.y) else { continue }
                if bestAll == nil || p.lateral < bestAll!.lateral {
                    bestAll = p
                    hintEdge = i
                }
            }
            best = bestAll
        }
        guard let proj = best else { return nil }

        // ── hysteretic lock ────────────────────────────────────────────────
        let lockEnter = 12.0 + fix.accuracyM * 0.5
        let lockExit = lockEnter * 1.6
        if !locked && proj.lateral <= lockEnter {
            locked = true
            unlockAccumMs = 0
        } else if locked {
            if proj.lateral > lockExit {
                unlockAccumMs += dtMs
                if unlockAccumMs >= 2500 { locked = false }
            } else {
                unlockAccumMs = 0
            }
        }

        return SnapResult(
            point: locked ? fromLocal(x: proj.x, y: proj.y) : fix.point,
            edgeId: proj.edge.id,
            edgeOffsetM: proj.offsetM,
            lateralOffsetM: proj.lateral,
            headingDeg: proj.headingDeg,
            onRoad: locked
        )
    }

    /// Geometry-aligned heading: road tangent when locked and slow.
    func alignedHeading(fix: FusedFix, snap: SnapResult?) -> Double {
        guard let snap, snap.onRoad, fix.speedMps < 3.0 else { return fix.headingDeg }
        let forward = snap.headingDeg
        let backward = (forward + 180).truncatingRemainder(dividingBy: 360)
        let df = abs(shortestAngleDeltaDeg(from: fix.headingDeg, to: forward))
        let db = abs(shortestAngleDeltaDeg(from: fix.headingDeg, to: backward))
        let oneWay = roadGraph.edges.first { $0.id == snap.edgeId }?.oneWay ?? false
        return (db < df && !oneWay) ? backward : forward
    }

    /// Advance a point along its edge by distM — used by dead reckoning.
    func advanceAlongEdge(edgeId: String, offsetM: Double, distM: Double) -> SnapResult? {
        guard let le = localEdges.first(where: { $0.edge.id == edgeId }),
              let total = le.cumM.last, le.xs.count >= 2 else { return nil }
        let target = min(max(offsetM + distM, 0), total)
        var i = 0
        while i < le.cumM.count - 2 && le.cumM[i + 1] < target { i += 1 }
        let span = le.cumM[i + 1] - le.cumM[i]
        let t = span > 0 ? (target - le.cumM[i]) / span : 0
        let x = le.xs[i] + (le.xs[i + 1] - le.xs[i]) * t
        let y = le.ys[i] + (le.ys[i + 1] - le.ys[i]) * t
        let heading = (atan2(le.xs[i + 1] - le.xs[i], le.ys[i + 1] - le.ys[i]) * 180 / .pi + 360)
            .truncatingRemainder(dividingBy: 360)
        return SnapResult(
            point: fromLocal(x: x, y: y),
            edgeId: edgeId,
            edgeOffsetM: target,
            lateralOffsetM: 0,
            headingDeg: heading,
            onRoad: true
        )
    }

    // ─── internals ────────────────────────────────────────────────────────────

    private func project(onto le: LocalEdge, px: Double, py: Double) -> Projection? {
        var best: Projection?
        guard le.xs.count >= 2 else { return nil }
        for i in 0..<(le.xs.count - 1) {
            let ex = le.xs[i + 1] - le.xs[i]
            let ey = le.ys[i + 1] - le.ys[i]
            let lenSq = ex * ex + ey * ey
            if lenSq == 0 { continue }
            var t = ((px - le.xs[i]) * ex + (py - le.ys[i]) * ey) / lenSq
            t = min(max(t, 0), 1)
            let sx = le.xs[i] + ex * t
            let sy = le.ys[i] + ey * t
            let d = hypot(px - sx, py - sy)
            if best == nil || d < best!.lateral {
                best = Projection(
                    edge: le.edge,
                    x: sx,
                    y: sy,
                    offsetM: le.cumM[i] + sqrt(lenSq) * t,
                    lateral: d,
                    headingDeg: (atan2(ex, ey) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
                )
            }
        }
        return best
    }

    private func toLocal(_ p: GeoPoint) -> (x: Double, y: Double) {
        guard let o = origin else { return (0, 0) }
        return (
            (p.lng - o.lng) * .pi / 180 * GeoPoint.earthRadiusM * cosLat,
            (p.lat - o.lat) * .pi / 180 * GeoPoint.earthRadiusM
        )
    }

    private func fromLocal(x: Double, y: Double) -> GeoPoint {
        guard let o = origin else { return GeoPoint(lat: 0, lng: 0) }
        return GeoPoint(
            lat: o.lat + y / GeoPoint.earthRadiusM * 180 / .pi,
            lng: o.lng + x / (GeoPoint.earthRadiusM * cosLat) * 180 / .pi
        )
    }
}
