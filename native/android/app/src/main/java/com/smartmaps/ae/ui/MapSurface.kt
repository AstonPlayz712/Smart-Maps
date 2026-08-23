package com.smartmaps.ae.ui

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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import com.smartmaps.ae.core.GeoPoint
import com.smartmaps.ae.core.RoadGraph
import com.smartmaps.ae.core.Route
import kotlin.math.cos

/**
 * MapSurface — the persistent native map layer (no SDK, no tiles, no WebView).
 *
 * MAP LAYER RULES (SM design language):
 *   • It is always rendered — it never returns early. With no fix and no
 *     graph it still draws the live metric grid, so the surface always reads
 *     as a living map, never a blank void ("map not rendering" fix).
 *   • It is owned by the root container (SmartMapsApp), never mounted inside
 *     a screen/destination — destinations only swap the card layer above it.
 *   • It always fills the window (fillMaxSize on the root) — the collapsing
 *     0dp container class of bug cannot occur because nothing measures it
 *     against wrap-content parents.
 *
 * Camera centres on the fused position; scale comes from the adaptive bucket
 * (phones ~900 m across, tablets 1400–1600 m).
 *
 * ── PRE-V2 — DO NOT EXTEND ─────────────────────────────────────────────────
 * TODO(renderer-v2): this surface predates Renderer v2 and is the last
 *   platform still on the old path. Web (`sm-core/renderer`) and iOS
 *   (`SMMapAdapter`) were ported; Android was not. Three v2 rules are missing
 *   here, and each one is a real defect on this surface today:
 *
 *   1. ACCURACY-RING CLAMP — the halo below is a hard-coded 46 px radius that
 *      ignores the reported accuracy entirely. It is a decoration, not an
 *      accuracy indicator: a 5 m fix and a 500 m fix draw the same circle.
 *      v2 converts metres to pixels against the live zoom and latitude,
 *      floors at 6 px and caps at 80 px — see
 *      [com.smartmaps.ae.ui.render.resolveAccuracyRing].
 *
 *   2. DEBUGMODE GATE — this surface has no notion of internal layers, so
 *      there is no flag stopping one being added straight into the user's
 *      map. v2 builds every internal layer through
 *      [com.smartmaps.ae.ui.render.buildInternalDebugLayer], which returns
 *      null unless the gate is open, and the gate defaults to closed.
 *
 *   3. FLOOR CLIPPING — every edge in [graph] is drawn regardless of which
 *      floor it belongs to, so in a multi-storey venue other floors bleed
 *      through the active one. v2 puts every indoor feature through
 *      [com.smartmaps.ae.ui.render.isOnActiveFloor] first.
 *
 *   Migration target is [com.smartmaps.ae.ui.render.MapSurfaceV2], which
 *   already implements all three. What it still needs before it can replace
 *   this composable is the SM-VT v2 tile pipeline (see `sm-core/tiles`) to
 *   feed it geometry — until then it has the rules but no tiles, and this has
 *   the tiles-equivalent (the local road graph) but none of the rules.
 */
@Composable
fun MapSurface(
    graph: RoadGraph,
    route: Route?,
    position: GeoPoint?,
    headingDeg: Double,
    onRoad: Boolean,
    modifier: Modifier = Modifier,
    metersPerScreen: Double = 900.0
) {
    val roadColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.25f)
    val gridColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
    val routeColor = MaterialTheme.colorScheme.primary
    val positionColor = if (onRoad) MaterialTheme.colorScheme.primary else Color(0xFFFFB74D)
    val background = MaterialTheme.colorScheme.background

    Canvas(modifier = modifier.fillMaxSize().background(background)) {
        // Camera anchor: fused position → graph origin → (0,0 grid only).
        val center = position ?: graph.edges.firstOrNull()?.path?.firstOrNull()
        val scale = size.minDimension / metersPerScreen // px per metre
        val cosLat = center?.let { cos(Math.toRadians(it.lat)) } ?: 1.0

        fun toScreen(p: GeoPoint): Offset {
            val c = center ?: return Offset(size.width / 2, size.height / 2)
            val dx = Math.toRadians(p.lng - c.lng) * GeoPoint.EARTH_R * cosLat
            val dy = Math.toRadians(p.lat - c.lat) * GeoPoint.EARTH_R
            return Offset(
                (size.width / 2 + dx * scale).toFloat(),
                (size.height / 2 - dy * scale).toFloat()
            )
        }

        // ── metric grid: 100 m lines, always drawn (live surface, never void)
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

        // ── road graph
        // TODO(renderer-v2): no floor clipping — every edge draws on every
        //   floor. Gate each one on isOnActiveFloor(activeLevel, edge.floor)
        //   once RoadGraph carries a floor, so other storeys stop bleeding
        //   through the active floor plan.
        for (edge in graph.edges) {
            if (edge.path.size < 2) continue
            val path = Path()
            val first = toScreen(edge.path.first())
            path.moveTo(first.x, first.y)
            for (i in 1 until edge.path.size) {
                val pt = toScreen(edge.path[i])
                path.lineTo(pt.x, pt.y)
            }
            drawPath(
                path,
                color = roadColor,
                style = Stroke(width = 10f, cap = StrokeCap.Round, join = StrokeJoin.Round)
            )
        }

        // ── active route
        if (route != null && route.points.size >= 2) {
            val path = Path()
            val first = toScreen(route.points.first())
            path.moveTo(first.x, first.y)
            for (i in 1 until route.points.size) {
                val pt = toScreen(route.points[i])
                path.lineTo(pt.x, pt.y)
            }
            drawPath(
                path,
                color = routeColor.copy(alpha = 0.9f),
                style = Stroke(width = 16f, cap = StrokeCap.Round, join = StrokeJoin.Round)
            )
        }

        // ── fused position: accuracy halo + heading arrow
        // TODO(renderer-v2): the 46f radius is fixed and unrelated to the
        //   actual accuracy. Replace with resolveAccuracyRing(position, zoom)
        //   from ui.render — metres to pixels, clamped, and suppressed indoors
        //   in favour of vertical accuracy.
        if (position != null) {
            val c = toScreen(position)
            drawCircle(positionColor.copy(alpha = 0.18f), radius = 46f, center = c)
            rotate(degrees = headingDeg.toFloat(), pivot = c) {
                val arrow = Path().apply {
                    moveTo(c.x, c.y - 26f)
                    lineTo(c.x - 16f, c.y + 18f)
                    lineTo(c.x, c.y + 8f)
                    lineTo(c.x + 16f, c.y + 18f)
                    close()
                }
                drawPath(arrow, positionColor)
            }
        }

        // ── scale reference: a 100 m tick, bottom-left
        if (gridStepPx > 12f) {
            val y = size.height - 24f
            drawLine(roadColor, Offset(24f, y), Offset(24f + gridStepPx, y), strokeWidth = 4f)
        }
    }
}
