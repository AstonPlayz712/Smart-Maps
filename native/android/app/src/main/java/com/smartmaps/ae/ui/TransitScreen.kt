package com.smartmaps.ae.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.smartmaps.ae.core.TransitArrival
import com.smartmaps.ae.core.TransportMode

/**
 * Transit — live arrivals/departures around the fused position. The board is
 * exactly what the registered feed providers know right now: live rows are
 * marked live, timetable rows aren't, and an empty board means no provider
 * has data here (never a spinner pretending otherwise).
 */
@Composable
fun TransitScreen(core: AECore) {
    val arrivals by core.arrivals.collectAsState()

    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Departures", style = MaterialTheme.typography.headlineSmall)

        if (arrivals.isEmpty()) {
            Text(
                "No arrivals known here yet — the board fills automatically as transport feeds report.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f)
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(arrivals) { arrival -> ArrivalRow(arrival) }
            }
        }
    }
}

@Composable
private fun ArrivalRow(arrival: TransitArrival) {
    val minutes = ((arrival.expectedAtMs - System.currentTimeMillis()) / 60000).coerceAtLeast(0)
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    "${modeLabel(arrival.mode)} ${arrival.line} → ${arrival.destination}",
                    style = MaterialTheme.typography.titleSmall
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
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

private fun modeLabel(mode: TransportMode): String = when (mode) {
    TransportMode.BUS -> "Bus"
    TransportMode.TRAIN -> "Train"
    TransportMode.TUBE -> "Tube"
    TransportMode.TRAM -> "Tram"
    TransportMode.FERRY -> "Ferry"
}
