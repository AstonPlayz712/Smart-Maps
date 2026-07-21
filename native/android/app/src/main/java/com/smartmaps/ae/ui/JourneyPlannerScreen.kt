package com.smartmaps.ae.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.core.GeoPoint

/**
 * Journey planner — start → destination over the offline road graph.
 * Start defaults to the live fused position (automatic); destination accepts
 * "lat, lng" today, with place search landing when a geocoder module exists
 * (it activates then — nothing here waits for it).
 */
@Composable
fun JourneyPlannerScreen(core: AECore, onRoutePlanned: () -> Unit) {
    val fix by core.fix.collectAsState()
    val route by core.route.collectAsState()
    var destText by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Journey planner", style = MaterialTheme.typography.headlineSmall)

        Text(
            "From: " + (fix?.let { "%.5f, %.5f (current position)".format(it.point.lat, it.point.lng) }
                ?: "acquiring position…"),
            style = MaterialTheme.typography.bodyMedium
        )

        OutlinedTextField(
            value = destText,
            onValueChange = { destText = it; error = null },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Destination (lat, lng)") },
            singleLine = true,
            isError = error != null,
            supportingText = { error?.let { Text(it) } }
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = {
                    val dest = parseLatLng(destText)
                    if (dest == null) {
                        error = "Enter as: 51.5074, -0.1278"
                    } else {
                        val planned = core.navigateTo(dest)
                        if (planned == null) error = "No route found on the offline graph"
                        else onRoutePlanned()
                    }
                },
                enabled = fix != null
            ) { Text("Plan route") }

            if (route != null) {
                Button(onClick = { core.clearRoute() }) { Text("Clear") }
            }
        }

        route?.let { r ->
            Text(
                "${formatDistance(r.distanceM)}  •  ${formatEta(r.etaS)}",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(r.steps) { step ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(step.instruction, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                formatDistance(step.distanceM) + " from start",
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun parseLatLng(text: String): GeoPoint? {
    val parts = text.split(",").map { it.trim() }
    if (parts.size != 2) return null
    val lat = parts[0].toDoubleOrNull() ?: return null
    val lng = parts[1].toDoubleOrNull() ?: return null
    if (lat !in -90.0..90.0 || lng !in -180.0..180.0) return null
    return GeoPoint(lat, lng)
}
