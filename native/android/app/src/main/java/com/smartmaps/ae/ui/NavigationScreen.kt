package com.smartmaps.ae.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.core.RoadGraph

/**
 * Navigation — the native map surface with the snapped position and the live
 * next instruction. Everything updates from AECore state alone; there is no
 * "start navigation" ceremony — an active route shows guidance, no route
 * shows free-drive tracking. Automatic and dynamic.
 */
@Composable
fun NavigationScreen(core: AECore) {
    val fix by core.fix.collectAsState()
    val snap by core.snap.collectAsState()
    val route by core.route.collectAsState()
    val nextStep by core.nextStep.collectAsState()
    val remaining by core.remaining.collectAsState()

    Box(Modifier.fillMaxSize()) {
        MapSurface(
            graph = core.spatial.graph(),
            route = route,
            position = fix?.point,
            headingDeg = fix?.headingDeg ?: 0.0,
            onRoad = snap?.onRoad == true
        )

        // Instruction banner — present exactly when a route is active.
        val step = nextStep
        if (route != null && step != null) {
            Card(
                modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(16.dp)
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(step.instruction, style = MaterialTheme.typography.titleMedium)
                    Text(
                        formatDistance(remaining.first) + "  •  " + formatEta(remaining.second),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }

        // Tracking chip — snapped/off-road state, always live.
        Card(modifier = Modifier.align(Alignment.BottomStart).padding(16.dp)) {
            Text(
                text = when {
                    fix == null -> "Acquiring…"
                    snap?.onRoad == true -> "On ${roadName(core.spatial.graph(), snap!!.edgeId)}"
                    else -> "Off-road"
                },
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelMedium
            )
        }
    }
}

private fun roadName(graph: RoadGraph, edgeId: String): String =
    graph.edges.firstOrNull { it.id == edgeId }?.name ?: "road"

internal fun formatDistance(m: Double): String =
    if (m >= 1000) "%.1f km".format(m / 1000) else "%.0f m".format(m)

internal fun formatEta(s: Double): String {
    val mins = (s / 60).toInt()
    return if (mins >= 60) "${mins / 60} h ${mins % 60} min" else "$mins min"
}
