package com.smartmaps.ae.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.core.MotionState

/**
 * Home — search + quick modes. Everything on this screen reflects live
 * engine state: the status strip is the fused fix + movement estimate, and
 * the quick modes jump straight into the live screens.
 */
@Composable
fun HomeScreen(
    core: AECore,
    onNavigate: () -> Unit,
    onTransit: () -> Unit,
    onPlanner: () -> Unit
) {
    val fix by core.fix.collectAsState()
    val movement by core.movementState.collectAsState()
    var query by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Smart Maps A/E", style = MaterialTheme.typography.headlineMedium)

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search places, stops, postcodes…") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            QuickMode(Icons.Filled.Navigation, "Navigate", Modifier.weight(1f), onNavigate)
            QuickMode(Icons.Filled.DirectionsBus, "Transit", Modifier.weight(1f), onTransit)
            QuickMode(Icons.Filled.Route, "Plan", Modifier.weight(1f), onPlanner)
        }

        Spacer(Modifier.weight(1f))

        // Live engine status — automatic, no refresh button anywhere.
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Live state", style = MaterialTheme.typography.labelLarge)
                Text(
                    fix?.let {
                        "%.5f, %.5f  ±%.0fm  •  %s".format(
                            it.point.lat, it.point.lng, it.accuracyM,
                            it.sources.joinToString("+") { s -> s.name }
                        )
                    } ?: "Acquiring position…",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    when (movement.state) {
                        MotionState.STILL -> "Still"
                        MotionState.WALKING -> "Walking"
                        MotionState.DRIVING -> "Driving"
                        MotionState.UNKNOWN -> "Motion unknown"
                    } + "  •  confidence %.0f%%".format(movement.confidence * 100),
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
private fun QuickMode(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    // Stable clickable modifier instead of the experimental Card(onClick) API.
    Card(modifier = modifier.clickable(onClick = onClick)) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(6.dp))
            Text(label, style = MaterialTheme.typography.labelLarge)
        }
    }
}
