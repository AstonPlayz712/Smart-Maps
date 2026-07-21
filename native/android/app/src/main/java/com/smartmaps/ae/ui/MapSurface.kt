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
 * MapSurface — the native map renderer (no SDK, no tiles, no WebView).
 *
 * Draws the offline road graph, the active route, and the snapped position
 * from engine geometry on a Compose Canvas. This is the mobile expression of
 * the Zante renderer: engine-owned geometry drawn natively. Camera follows
 * the fused position; north-up unless a heading is provided.
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
    val routeColor = MaterialTheme.colorScheme.primary
    val positionColor = if (onRoad) MaterialTheme.colorScheme.primary else Color(0xFFFFB74D)
    val background = MaterialTheme.colorScheme.background

    Canvas(modifier = modifier.fillMaxSize().background(background)) {
        val center = position ?: graph.edges.firstOrNull()?.path?.firstOrNull() ?: return@Canvas
        val scale = size.minDimension / metersPerScreen // px per metre
        val cosLat = cos(Math.toRadians(center.lat))

        fun toScreen(p: GeoPoint): Offset {
            val dx = Math.toRadians(p.lng - center.lng) * GeoPoint.EARTH_R * cosLat
            val dy = Math.toRadians(p.lat - center.lat) * GeoPoint.EARTH_R
            return Offset(
                (size.width / 2 + dx * scale).toFloat(),
                (size.height / 2 - dy * scale).toFloat()
            )
        }

        // Road graph
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

        // Active route
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

        // Snapped position: heading-rotated arrow with accuracy halo.
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
    }
}
