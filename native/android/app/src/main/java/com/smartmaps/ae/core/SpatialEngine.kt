package com.smartmaps.ae.core

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sqrt

/**
 * A/E Spatial Engine — road snapping + geometry alignment.
 *
 * Projects fused fixes onto the road graph (local equirectangular plane,
 * nearest-edge search with a hint window — port of the TS RouteManager
 * projection) and aligns heading to road geometry when the sensor course is
 * unreliable. Snap lock is hysteretic: lock inside the accuracy-widened road
 * envelope, unlock only after being sustainedly outside a wider band.
 */
class SpatialEngine {

    private var graph: RoadGraph = RoadGraph.EMPTY
    private var origin: GeoPoint? = null
    private var cosLat = 1.0
    private var locked = false
    private var unlockAccumMs = 0L
    private var hintEdge = -1

    /** Flattened edge geometry in local metres for fast projection. */
    private data class LocalEdge(
        val edge: RoadEdge,
        val xs: DoubleArray,
        val ys: DoubleArray,
        val cumM: DoubleArray
    )

    private var localEdges: List<LocalEdge> = emptyList()

    fun setGraph(graph: RoadGraph) {
        this.graph = graph
        hintEdge = -1
        locked = false
        unlockAccumMs = 0
        val first = graph.edges.firstOrNull()?.path?.firstOrNull()
        origin = first
        cosLat = if (first != null) cos(Math.toRadians(first.lat)) else 1.0
        localEdges = graph.edges.map { edge ->
            val xs = DoubleArray(edge.path.size)
            val ys = DoubleArray(edge.path.size)
            val cum = DoubleArray(edge.path.size)
            for (i in edge.path.indices) {
                val l = toLocal(edge.path[i])
                xs[i] = l.first
                ys[i] = l.second
                if (i > 0) cum[i] = cum[i - 1] + hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])
            }
            LocalEdge(edge, xs, ys, cum)
        }
    }

    fun graph(): RoadGraph = graph

    fun isLocked(): Boolean = locked

    fun reset() {
        locked = false
        unlockAccumMs = 0
        hintEdge = -1
    }

    /**
     * Snap [fix] to the nearest road edge. Returns null when no graph is
     * loaded. `onRoad` reflects the hysteretic lock, not just this fix.
     */
    fun snap(fix: FusedFix, dtMs: Long): SnapResult? {
        if (localEdges.isEmpty() || origin == null) return null
        val (px, py) = toLocal(fix.point)

        // Hint-first search: the edge we matched last tick, then everything.
        var best = if (hintEdge in localEdges.indices) projectOnto(localEdges[hintEdge], px, py) else null
        if (best == null || best.lateral > 120.0) {
            var bestAll: Projection? = null
            for (i in localEdges.indices) {
                val p = projectOnto(localEdges[i], px, py) ?: continue
                if (bestAll == null || p.lateral < bestAll.lateral) {
                    bestAll = p
                    hintEdge = i
                }
            }
            best = bestAll
        }
        val proj = best ?: return null

        // ── hysteretic lock ────────────────────────────────────────────────
        val lockEnter = 12.0 + fix.accuracyM * 0.5
        val lockExit = lockEnter * 1.6
        if (!locked && proj.lateral <= lockEnter) {
            locked = true
            unlockAccumMs = 0
        } else if (locked) {
            if (proj.lateral > lockExit) {
                unlockAccumMs += dtMs
                if (unlockAccumMs >= 2500) locked = false
            } else {
                unlockAccumMs = 0
            }
        }

        return SnapResult(
            point = if (locked) fromLocal(proj.x, proj.y) else fix.point,
            edgeId = proj.edge.id,
            edgeOffsetM = proj.offsetM,
            lateralOffsetM = proj.lateral,
            headingDeg = proj.headingDeg,
            onRoad = locked
        )
    }

    /**
     * Geometry-aligned heading: road tangent when locked and slow (course is
     * noise at low speed), sensor heading when moving fast.
     */
    fun alignedHeading(fix: FusedFix, snap: SnapResult?): Double {
        if (snap == null || !snap.onRoad) return fix.headingDeg
        if (fix.speedMps >= 3.0) return fix.headingDeg
        // Pick the tangent direction closest to the sensor heading (edges are
        // bidirectional unless one-way).
        val forward = snap.headingDeg
        val backward = (forward + 180.0) % 360.0
        val df = kotlin.math.abs(shortestAngleDeltaDeg(fix.headingDeg, forward))
        val db = kotlin.math.abs(shortestAngleDeltaDeg(fix.headingDeg, backward))
        return if (db < df && !isOneWay(snap.edgeId)) backward else forward
    }

    /** Advance a point along its edge by [distM] — used by dead reckoning. */
    fun advanceAlongEdge(edgeId: String, offsetM: Double, distM: Double): SnapResult? {
        val le = localEdges.firstOrNull { it.edge.id == edgeId } ?: return null
        val total = le.cumM.last()
        val target = (offsetM + distM).coerceIn(0.0, total)
        var i = 0
        while (i < le.cumM.size - 2 && le.cumM[i + 1] < target) i++
        val span = le.cumM[i + 1] - le.cumM[i]
        val t = if (span > 0) (target - le.cumM[i]) / span else 0.0
        val x = le.xs[i] + (le.xs[i + 1] - le.xs[i]) * t
        val y = le.ys[i] + (le.ys[i + 1] - le.ys[i]) * t
        val heading = (Math.toDegrees(atan2(le.xs[i + 1] - le.xs[i], le.ys[i + 1] - le.ys[i])) + 360.0) % 360.0
        return SnapResult(fromLocal(x, y), edgeId, target, 0.0, heading, onRoad = true)
    }

    // ─── internals ────────────────────────────────────────────────────────────

    private data class Projection(
        val edge: RoadEdge,
        val x: Double,
        val y: Double,
        val offsetM: Double,
        val lateral: Double,
        val headingDeg: Double
    )

    private fun projectOnto(le: LocalEdge, px: Double, py: Double): Projection? {
        var best: Projection? = null
        for (i in 0 until le.xs.size - 1) {
            val ex = le.xs[i + 1] - le.xs[i]
            val ey = le.ys[i + 1] - le.ys[i]
            val lenSq = ex * ex + ey * ey
            if (lenSq == 0.0) continue
            var t = ((px - le.xs[i]) * ex + (py - le.ys[i]) * ey) / lenSq
            t = t.coerceIn(0.0, 1.0)
            val sx = le.xs[i] + ex * t
            val sy = le.ys[i] + ey * t
            val d = hypot(px - sx, py - sy)
            if (best == null || d < best.lateral) {
                best = Projection(
                    edge = le.edge,
                    x = sx,
                    y = sy,
                    offsetM = le.cumM[i] + sqrt(lenSq) * t,
                    lateral = d,
                    headingDeg = (Math.toDegrees(atan2(ex, ey)) + 360.0) % 360.0
                )
            }
        }
        return best
    }

    private fun isOneWay(edgeId: String): Boolean =
        graph.edges.firstOrNull { it.id == edgeId }?.oneWay == true

    private fun toLocal(p: GeoPoint): Pair<Double, Double> {
        val o = origin!!
        return Pair(
            Math.toRadians(p.lng - o.lng) * GeoPoint.EARTH_R * cosLat,
            Math.toRadians(p.lat - o.lat) * GeoPoint.EARTH_R
        )
    }

    private fun fromLocal(x: Double, y: Double): GeoPoint {
        val o = origin!!
        return GeoPoint(
            lat = o.lat + Math.toDegrees(y / GeoPoint.EARTH_R),
            lng = o.lng + Math.toDegrees(x / (GeoPoint.EARTH_R * cosLat))
        )
    }
}
