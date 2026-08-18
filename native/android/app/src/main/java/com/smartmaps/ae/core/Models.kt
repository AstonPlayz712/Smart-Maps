package com.smartmaps.ae.core

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Shared data models for the A/E All-In-One Core. Plain data only — engines
 * exchange these shapes and meet exclusively inside AECore.
 *
 * These mirror the TS reference layer (src/logic/types.ts) so behaviour
 * parity between the browser harness and the native app is checkable.
 */

data class GeoPoint(val lat: Double, val lng: Double) {
    companion object {
        const val EARTH_R = 6371000.0
    }
}

fun haversineM(a: GeoPoint, b: GeoPoint): Double {
    val dLat = Math.toRadians(b.lat - a.lat)
    val dLng = Math.toRadians(b.lng - a.lng)
    val la1 = Math.toRadians(a.lat)
    val la2 = Math.toRadians(b.lat)
    val h = sin(dLat / 2) * sin(dLat / 2) +
        cos(la1) * cos(la2) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * GeoPoint.EARTH_R * asin(min(1.0, sqrt(h)))
}

fun bearingDeg(a: GeoPoint, b: GeoPoint): Double {
    val p1 = Math.toRadians(a.lat)
    val p2 = Math.toRadians(b.lat)
    val dl = Math.toRadians(b.lng - a.lng)
    val y = sin(dl) * cos(p2)
    val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
    return (Math.toDegrees(atan2(y, x)) + 360.0) % 360.0
}

/** Wrap so interpolation takes the short way around 0/360. */
fun shortestAngleDeltaDeg(from: Double, to: Double): Double =
    ((to - from + 540.0) % 360.0) - 180.0

// ─── Location fusion ─────────────────────────────────────────────────────────

enum class FixSource { GPS, WIFI, CELL, BLUETOOTH, FUSED, DEAD_RECKONING }

data class RawFix(
    val point: GeoPoint,
    val accuracyM: Double,
    val speedMps: Double?,
    val bearingDeg: Double?,
    val source: FixSource,
    val timestampMs: Long
)

data class FusedFix(
    val point: GeoPoint,
    val accuracyM: Double,
    val speedMps: Double,
    val headingDeg: Double,
    /** Which raw sources contributed this tick. */
    val sources: Set<FixSource>,
    val timestampMs: Long
)

// ─── Movement ────────────────────────────────────────────────────────────────

data class MotionSample(
    /** Linear acceleration magnitude, gravity removed, m/s². */
    val accelMagnitude: Double,
    /** Rotation rate magnitude, rad/s. */
    val gyroMagnitude: Double,
    val timestampMs: Long
)

enum class MotionState { STILL, WALKING, DRIVING, UNKNOWN }

data class MovementEstimate(
    val state: MotionState,
    /** Confidence in the state, 0..1. */
    val confidence: Double,
    /** IMU motion energy 0..1 — gates dead reckoning decay. */
    val imuActivity: Double,
    val timestampMs: Long
)

// ─── Road graph / geometry ───────────────────────────────────────────────────

data class RoadNode(val id: String, val point: GeoPoint)

data class RoadEdge(
    val id: String,
    val fromNodeId: String,
    val toNodeId: String,
    /** Polyline including endpoints. */
    val path: List<GeoPoint>,
    val lengthM: Double,
    val name: String? = null,
    val speedLimitMps: Double = 13.4, // ~30 mph default
    val oneWay: Boolean = false
)

data class RoadGraph(
    val nodes: Map<String, RoadNode>,
    val edges: List<RoadEdge>
) {
    fun edgesFrom(nodeId: String): List<RoadEdge> = edges.filter {
        it.fromNodeId == nodeId || (!it.oneWay && it.toNodeId == nodeId)
    }

    companion object {
        val EMPTY = RoadGraph(emptyMap(), emptyList())
    }
}

/** Result of snapping a fix onto the road graph. */
data class SnapResult(
    val point: GeoPoint,
    val edgeId: String,
    /** Metres along the edge polyline. */
    val edgeOffsetM: Double,
    val lateralOffsetM: Double,
    /** Edge tangent heading at the snap point. */
    val headingDeg: Double,
    val onRoad: Boolean
)

// ─── Routing ─────────────────────────────────────────────────────────────────

enum class Turn { DEPART, CONTINUE, SLIGHT_LEFT, LEFT, SHARP_LEFT, SLIGHT_RIGHT, RIGHT, SHARP_RIGHT, U_TURN, ARRIVE }

data class RouteStep(
    val turn: Turn,
    val instruction: String,
    val point: GeoPoint,
    val distanceM: Double,
    val etaS: Double
)

data class Route(
    val points: List<GeoPoint>,
    val steps: List<RouteStep>,
    val distanceM: Double,
    val etaS: Double
)

// ─── Transport ───────────────────────────────────────────────────────────────

enum class TransportMode { BUS, TRAIN, TUBE, TRAM, FERRY }

data class TransitStop(val id: String, val name: String, val point: GeoPoint, val mode: TransportMode)

data class TransitArrival(
    val stopId: String,
    val line: String,
    val destination: String,
    val mode: TransportMode,
    val expectedAtMs: Long,
    /** Live vs timetable — absence of live data is just absence, never faked. */
    val live: Boolean
)
