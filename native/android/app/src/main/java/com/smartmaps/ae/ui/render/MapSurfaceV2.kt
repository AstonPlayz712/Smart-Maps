package com.smartmaps.ae.ui.render

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import kotlin.math.PI
import kotlin.math.cos

/**
 * MapSurfaceV2 — the Renderer v2 map layer for Android.
 *
 * A minimal but honest surface: it consumes a [DseFrame] produced by the
 * shared engine and enforces the three rules v2 exists for, which the pre-v2
 * [com.smartmaps.ae.ui.MapSurface] does not:
 *
 *   1. **Accuracy-ring clamp.** The ring is metres converted to pixels against
 *      the live zoom and latitude, floored at 6 px and capped at 80 px. The
 *      old surface drew a fixed 46 px halo regardless of the actual accuracy,
 *      which is a decoration, not an accuracy indicator.
 *   2. **debugMode gate.** Internal layers are built through
 *      [buildInternalDebugLayer], which returns null unless the flag is on.
 *      With it off there is no internal geometry in the frame at all.
 *   3. **Floor clipping.** Every indoor feature passes [isOnActiveFloor]
 *      before it is drawn, so another floor's geometry cannot bleed through.
 *
 * ── PORT STATUS ────────────────────────────────────────────────────────────
 * TODO(renderer-v2): this is a stub surface, not the finished port.
 *   Outstanding, in order:
 *     - SM-VT v2 tile source (see `sm-core/tiles`) to populate
 *       [DseFrame.roads] / [DseFrame.buildings] / [DseFrame.pois]; until then
 *       those lists arrive empty and only the grid, position and ring draw.
 *     - the full layer stack from `sm-core/renderer/MapRenderer.ts`:
 *       base vector -> extruded 3D buildings -> indoor floor plan -> POI.
 *     - indoor floor outlines and walls, which need the venue payload.
 *     - promotion: swap [com.smartmaps.ae.ui.MapSurface] for this in
 *       SmartMapsApp once the tile pipeline lands.
 *   Visuals here are temporary. The *rules* are not — they are the shared
 *   contract and are already correct.
 */
@Composable
fun MapSurfaceV2(
    frame: DseFrame,
    modifier: Modifier = Modifier,
    config: RendererConfig = RendererConfig(),
    metersPerScreen: Double = 900.0
) {
    val gridColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
    val roadColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.25f)
    val buildingColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.10f)
    val positionColor = MaterialTheme.colorScheme.primary
    val debugColor = Color(0xFFFF5252)
    val background = MaterialTheme.colorScheme.background

    // Built through the gate. Null with debugMode off, which is the default.
    val debug = buildInternalDebugLayer(frame, config)

    Canvas(modifier = modifier.fillMaxSize().background(background)) {
        val centre = frame.position
        val scale = size.minDimension / metersPerScreen // px per metre
        val cosLat = cos(centre.lat * PI / 180.0)

        fun toScreen(p: GeoPointD): Offset {
            val dx = (p.lng - centre.lng) * PI / 180.0 * EARTH_R * cosLat
            val dy = (p.lat - centre.lat) * PI / 180.0 * EARTH_R
            return Offset(
                (size.width / 2 + dx * scale).toFloat(),
                (size.height / 2 - dy * scale).toFloat()
            )
        }

        // ── metric grid: always drawn, so the surface reads as a live map
        // rather than a void while the tile pipeline is still missing.
        val gridStepPx = (100.0 * scale).toFloat()
        if (gridStepPx > 12f) {
            var x = (size.width / 2) % gridStepPx
            while (x < size.width) {
                drawLine(gridColor, Offset(x, 0f), Offset(x, size.height), strokeWidth = 1f)
                x += gridStepPx
            }
            var y = (size.height / 2) % gridStepPx
            while (y < size.height) {
                drawLine(gridColor, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
                y += gridStepPx
            }
        }

        // ── base vector, floor-clipped
        for (line in frame.roads) {
            if (line.size < 2) continue
            if (!isOnActiveFloor(frame.activeFloorLevel, line.first().floorLevel)) continue
            drawPolyline(line.map { toScreen(it) }, roadColor, 10f)
        }

        // ── buildings, floor-clipped (extrusion arrives with the tile pipeline)
        if (config.buildings3D) {
            for (footprint in frame.buildings) {
                if (footprint.size < 3) continue
                if (!isOnActiveFloor(frame.activeFloorLevel, footprint.first().floorLevel)) continue
                drawPolyline(footprint.map { toScreen(it) }, buildingColor, 6f)
            }
        }

        // ── POIs, floor-clipped
        for (poi in frame.pois) {
            if (!isOnActiveFloor(frame.activeFloorLevel, poi.floorLevel)) continue
            drawCircle(roadColor, radius = 5f, center = toScreen(poi.position))
        }

        // ── accuracy ring: metres -> pixels, clamped, suppressed indoors in
        // favour of vertical accuracy. Never a fixed radius.
        val here = Offset(size.width / 2, size.height / 2)
        val ring = resolveAccuracyRing(frame.position, frame.zoom)
        if (ring.visible) {
            drawCircle(positionColor.copy(alpha = 0.16f), ring.radiusPx.toFloat(), here)
            if (ring.clamped) {
                // Capped: outline it so a capped ring never reads as a
                // measurement it is not.
                drawCircle(
                    positionColor.copy(alpha = 0.35f),
                    ring.radiusPx.toFloat(),
                    here,
                    style = Stroke(width = 1.5f)
                )
            }
        }

        // ── the subject
        rotate(degrees = frame.position.headingDeg.toFloat(), pivot = here) {
            val arrow = Path().apply {
                moveTo(here.x, here.y - 26f)
                lineTo(here.x - 16f, here.y + 18f)
                lineTo(here.x, here.y + 8f)
                lineTo(here.x + 16f, here.y + 18f)
                close()
            }
            drawPath(arrow, positionColor)
        }

        // ── internal layers, last and only when the gate is open
        if (debug != null) {
            drawCircle(debugColor, radius = 3f, center = here)
            drawLine(
                debugColor,
                here,
                Offset(here.x, here.y - metresToPixels(debug.speedMps * 5.0, centre.lat, frame.zoom).toFloat()),
                strokeWidth = 1f
            )
        }
    }
}

private const val EARTH_R = 6_371_000.0

private fun DrawScope.drawPolyline(points: List<Offset>, color: Color, width: Float) {
    if (points.size < 2) return
    val path = Path()
    path.moveTo(points.first().x, points.first().y)
    for (i in 1 until points.size) path.lineTo(points[i].x, points[i].y)
    drawPath(path, color, style = Stroke(width = width, cap = StrokeCap.Round, join = StrokeJoin.Round))
}
