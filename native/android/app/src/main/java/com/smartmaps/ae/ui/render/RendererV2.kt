package com.smartmaps.ae.ui.render

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Renderer v2 contracts, Android side.
 *
 * These are deliberate ports of `sm-core/renderer` — not re-derivations. The
 * web engine, the iOS renderer and this file must agree on the numbers, so the
 * maths below mirrors `sm-core/renderer/layers/AccuracyLayer.ts` and the floor
 * predicate mirrors `IndoorLayer.isOnActiveFloor`, constant for constant.
 *
 * If you change a threshold here, change it in all three or the platforms
 * silently disagree about what the user is being shown.
 *
 * ── PORT STATUS ────────────────────────────────────────────────────────────
 * TODO(renderer-v2): this file carries the v2 *rules*. The Android Compose
 *   surface is still the pre-v2 [com.smartmaps.ae.ui.MapSurface], which draws
 *   its own road graph rather than SM-VT v2 tiles. Finishing the port means:
 *     1. an SM-VT v2 tile source (four families, LRU cache, request
 *        coalescing, overzoom) equivalent to `sm-core/tiles`
 *     2. the layer stack in `sm-core/renderer/MapRenderer.ts`:
 *        base vector -> 3D buildings -> indoor floor -> POI
 *     3. [MapSurfaceV2] promoted to the app's map layer, replacing MapSurface
 *   The three rules v2 exists to enforce — accuracy-ring clamp, debugMode
 *   gate, floor clipping — are implemented here and used by [MapSurfaceV2]
 *   already, so they do not have to wait for the tile pipeline.
 */

/** Equator metres per pixel at zoom 0 for 256 px tiles. */
private const val METRES_PER_PIXEL_Z0 = 156543.03392

/**
 * Hard ceiling for the accuracy ring, pixels. A 500 m fix is genuinely
 * uncertain, but drawing a 900 px circle communicates nothing and hides the
 * map — past this size the ring is capped and marked [AccuracyRing.clamped]
 * so the UI can caption it.
 */
const val MAX_ACCURACY_RADIUS_PX = 80.0

/** Floor, so a very precise fix still renders as a visible dot. */
private const val MIN_ACCURACY_RADIUS_PX = 6.0

/**
 * Renderer configuration.
 *
 * [debugMode] gates every internal engine layer and defaults to **false**.
 * Internals are opt-in, never opt-out: a renderer constructed with no options
 * cannot draw them, and there is no user-facing control that flips it.
 */
data class RendererConfig(
    val debugMode: Boolean = false,
    val buildings3D: Boolean = true,
    val tileRadius: Int = 1
)

enum class AccuracyKind { HORIZONTAL, VERTICAL }

data class AccuracyRing(
    /** Radius to draw, pixels. Already clamped. */
    val radiusPx: Double,
    /** True when the true radius exceeded the cap. */
    val clamped: Boolean,
    /** Which accuracy this represents — indoors it is the vertical one. */
    val kind: AccuracyKind,
    /** The underlying accuracy in metres, for captions. */
    val accuracyM: Double,
    /** False when no ring should be drawn at all. */
    val visible: Boolean
)

/**
 * Ground resolution at a latitude and zoom, metres per pixel.
 *
 * Mercator compresses toward the poles, so latitude matters — using the
 * equator value everywhere over-sizes the ring by ~40% in London.
 */
fun metresPerPixel(latitude: Double, zoom: Double): Double {
    val latRad = latitude * PI / 180.0
    return METRES_PER_PIXEL_Z0 * cos(latRad) / 2.0.pow(zoom)
}

/** Metres -> screen pixels at the current camera. */
fun metresToPixels(metres: Double, latitude: Double, zoom: Double): Double {
    val mpp = metresPerPixel(latitude, zoom)
    if (!mpp.isFinite() || mpp <= 0.0) return 0.0
    return metres / mpp
}

/**
 * Resolve the accuracy ring for a position.
 *
 * Indoors ([DsePosition.floorLevel] non-null) the horizontal GNSS ring is
 * suppressed entirely: satellite accuracy is meaningless under a roof and the
 * huge ring it implies is pure noise on a floor plan. The vertical accuracy is
 * shown instead — the number that actually matters indoors, which is how sure
 * we are about which floor you are on.
 */
fun resolveAccuracyRing(position: DsePosition, zoom: Double): AccuracyRing {
    val indoors = position.floorLevel != null
    val kind = if (indoors) AccuracyKind.VERTICAL else AccuracyKind.HORIZONTAL
    val accuracyM = if (indoors) position.verticalAccuracyM else position.accuracyM

    if (!accuracyM.isFinite() || accuracyM <= 0.0) {
        return AccuracyRing(0.0, clamped = false, kind = kind, accuracyM = 0.0, visible = false)
    }

    val raw = metresToPixels(accuracyM, position.lat, zoom)
    val radiusPx = max(MIN_ACCURACY_RADIUS_PX, min(MAX_ACCURACY_RADIUS_PX, raw))

    return AccuracyRing(
        radiusPx = radiusPx,
        clamped = raw > MAX_ACCURACY_RADIUS_PX,
        kind = kind,
        accuracyM = accuracyM,
        visible = true
    )
}

/**
 * Floor clipping — one predicate, owned here, so no layer can forget it.
 *
 * A feature with no floor is outdoor geometry and always draws. A feature with
 * a floor draws only when the renderer is on that floor, and never when the
 * renderer is outdoors.
 */
fun isOnActiveFloor(activeLevel: Int?, featureLevel: Int?): Boolean {
    if (featureLevel == null) return true
    if (activeLevel == null) return false
    return featureLevel == activeLevel
}

// ─── DSE state, Android side ────────────────────────────────────────────────
//
// Mirrors `sm-core/types.ts` DseState and the parts of SMPosition the renderer
// reads. The shapes match field for field so a frame produced by the shared
// engine maps onto this without translation.

data class DsePosition(
    val lat: Double,
    val lng: Double,
    /** Horizontal accuracy, metres. */
    val accuracyM: Double,
    /** Course over ground, degrees. */
    val headingDeg: Double,
    /** Ground speed, m/s. */
    val speedMps: Double,
    /** Floor index; null outdoors. */
    val floorLevel: Int? = null,
    /** Height above venue ground, metres. */
    val altitudeM: Double = 0.0,
    /** Vertical accuracy, metres. */
    val verticalAccuracyM: Double = Double.POSITIVE_INFINITY,
    val timestampMs: Long = 0L,
    val venueId: String? = null
)

enum class VerticalMotionState { STAIRS, LIFT, ESCALATOR, STATIC }

/**
 * One frame's worth of state from the engine.
 *
 * TODO(renderer-v2): [roads], [buildings] and [pois] arrive empty until the
 *   SM-VT v2 tile pipeline lands on Android. Everything else is live, which is
 *   why the surface below can already be correct about position, accuracy and
 *   floor while the tile geometry is still missing.
 */
data class DseFrame(
    val position: DsePosition,
    /** Camera zoom the frame was resolved at — the accuracy ring depends on it. */
    val zoom: Double,
    val bearingDeg: Double = 0.0,
    /** Floor everything in this frame is clipped to; null outdoors. */
    val activeFloorLevel: Int? = null,
    val verticalMotionState: VerticalMotionState = VerticalMotionState.STATIC,
    val roads: List<List<GeoPointD>> = emptyList(),
    val buildings: List<List<GeoPointD>> = emptyList(),
    val pois: List<PoiMarker> = emptyList()
)

data class GeoPointD(val lng: Double, val lat: Double, val floorLevel: Int? = null)

data class PoiMarker(val name: String, val position: GeoPointD, val floorLevel: Int? = null)

/**
 * The internal engine layer.
 *
 * Returns null unless [RendererConfig.debugMode] is true — with the gate off
 * there is no internal geometry in the frame at all. Absent, not hidden: the
 * leak this replaced was possible because debug drawing had no flag of its own
 * and relied on callers not asking for it.
 */
fun buildInternalDebugLayer(frame: DseFrame, config: RendererConfig): DebugOverlay? {
    if (!config.debugMode) return null
    return DebugOverlay(
        accuracyM = frame.position.accuracyM,
        verticalAccuracyM = frame.position.verticalAccuracyM,
        floorLevel = frame.activeFloorLevel,
        headingDeg = frame.position.headingDeg,
        speedMps = frame.position.speedMps
    )
}

data class DebugOverlay(
    val accuracyM: Double,
    val verticalAccuracyM: Double,
    val floorLevel: Int?,
    val headingDeg: Double,
    val speedMps: Double
)

/** Metres between two points, flat-earth — accurate well inside one frame. */
internal fun groundDistanceM(a: GeoPointD, b: GeoPointD): Double {
    val latScale = 111_320.0
    val lngScale = 111_320.0 * cos(a.lat * PI / 180.0)
    val dLat = abs(b.lat - a.lat) * latScale
    val dLng = abs(b.lng - a.lng) * lngScale
    return kotlin.math.hypot(dLat, dLng)
}
