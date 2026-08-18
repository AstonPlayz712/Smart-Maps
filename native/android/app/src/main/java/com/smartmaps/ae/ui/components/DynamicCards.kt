package com.smartmaps.ae.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.core.GeoPoint
import com.smartmaps.ae.core.Route
import com.smartmaps.ae.core.RouteStep
import com.smartmaps.ae.core.TransitArrival
import com.smartmaps.ae.core.TransportMode
import com.smartmaps.ae.ui.adaptive.SmDimens

/**
 * Dynamic cards — the modular card layer. One card per active mode, floating
 * over the persistent map. Cards are modular (route / transit / plan), never
 * a monolithic sheet, and each is state-driven: it renders exactly what the
 * engines know right now.
 */

// ─── Navigate ────────────────────────────────────────────────────────────────

@Composable
fun NavigateCard(
    route: Route?,
    nextStep: RouteStep?,
    remainingM: Double,
    remainingEtaS: Double,
    trackingLabel: String,
    dimens: SmDimens,
    modifier: Modifier = Modifier
) {
    SmCard(dimens, modifier) {
        if (route != null && nextStep != null) {
            Text(nextStep.instruction, style = MaterialTheme.typography.titleMedium)
            Text(
                "${formatDistance(remainingM)}  •  ${formatEta(remainingEtaS)}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary
            )
        } else {
            Text("Free drive", style = MaterialTheme.typography.titleMedium)
            Text(
                "Tracking live — plan a route to start guidance.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
        }
        Text(
            trackingLabel,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
        )
    }
}

// ─── Transit ─────────────────────────────────────────────────────────────────

@Composable
fun TransitCard(
    arrivals: List<TransitArrival>,
    dimens: SmDimens,
    modifier: Modifier = Modifier
) {
    SmCard(dimens, modifier) {
        Text("Departures", style = MaterialTheme.typography.titleMedium)
        if (arrivals.isEmpty()) {
            Text(
                "No arrivals known here yet — the board fills automatically as transport feeds report.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
        } else {
            LazyColumn(
                modifier = Modifier.heightIn(max = if (dimens.isTablet) 420.dp else 260.dp),
                verticalArrangement = Arrangement.spacedBy(dimens.gridMicro)
            ) {
                items(arrivals) { arrival -> ArrivalRow(arrival) }
            }
        }
    }
}

@Composable
private fun ArrivalRow(arrival: TransitArrival) {
    val minutes = ((arrival.expectedAtMs - System.currentTimeMillis()) / 60000).coerceAtLeast(0)
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                "${modeLabel(arrival.mode)} ${arrival.line} → ${arrival.destination}",
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                if (arrival.live) "live" else "timetable",
                style = MaterialTheme.typography.labelSmall,
                color = if (arrival.live) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
        }
        Text(
            if (minutes == 0L) "due" else "$minutes min",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary
        )
    }
}

// ─── Plan ────────────────────────────────────────────────────────────────────

@Composable
fun PlanCard(
    core: AECore,
    hasFix: Boolean,
    route: Route?,
    dimens: SmDimens,
    onRoutePlanned: () -> Unit,
    modifier: Modifier = Modifier
) {
    var destText by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    SmCard(dimens, modifier) {
        Text("Journey planner", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = destText,
            onValueChange = { destText = it; error = null },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Destination (lat, lng)") },
            singleLine = true,
            isError = error != null,
            supportingText = { error?.let { Text(it) } }
        )
        Row(horizontalArrangement = Arrangement.spacedBy(dimens.gridMacro)) {
            Button(
                onClick = {
                    val dest = parseLatLng(destText)
                    if (dest == null) {
                        error = "Enter as: 51.5074, -0.1278"
                    } else if (core.navigateTo(dest) == null) {
                        error = "No route found on the offline graph"
                    } else {
                        onRoutePlanned()
                    }
                },
                enabled = hasFix
            ) { Text("Plan route") }
            if (route != null) {
                Button(onClick = { core.clearRoute() }) { Text("Clear") }
            }
        }
        route?.let { r ->
            Text(
                "${formatDistance(r.distanceM)}  •  ${formatEta(r.etaS)}",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary
            )
            LazyColumn(
                modifier = Modifier.heightIn(max = if (dimens.isTablet) 360.dp else 220.dp),
                verticalArrangement = Arrangement.spacedBy(dimens.gridMicro)
            ) {
                items(r.steps) { step ->
                    Column {
                        Text(step.instruction, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            formatDistance(step.distanceM) + " from start",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }
}

// ─── shared card chrome + helpers ────────────────────────────────────────────

@Composable
private fun SmCard(
    dimens: SmDimens,
    modifier: Modifier = Modifier,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            Modifier.padding(dimens.cardInnerPadding),
            verticalArrangement = Arrangement.spacedBy(dimens.gridMicro),
            content = content
        )
    }
}

private fun modeLabel(mode: TransportMode): String = when (mode) {
    TransportMode.BUS -> "Bus"
    TransportMode.TRAIN -> "Train"
    TransportMode.TUBE -> "Tube"
    TransportMode.TRAM -> "Tram"
    TransportMode.FERRY -> "Ferry"
}

private fun parseLatLng(text: String): GeoPoint? {
    val parts = text.split(",").map { it.trim() }
    if (parts.size != 2) return null
    val lat = parts[0].toDoubleOrNull() ?: return null
    val lng = parts[1].toDoubleOrNull() ?: return null
    if (lat !in -90.0..90.0 || lng !in -180.0..180.0) return null
    return GeoPoint(lat, lng)
}

fun formatDistance(m: Double): String =
    if (m >= 1000) "%.1f km".format(m / 1000) else "%.0f m".format(m)

fun formatEta(s: Double): String {
    val mins = (s / 60).toInt()
    return if (mins >= 60) "${mins / 60} h ${mins % 60} min" else "$mins min"
}
