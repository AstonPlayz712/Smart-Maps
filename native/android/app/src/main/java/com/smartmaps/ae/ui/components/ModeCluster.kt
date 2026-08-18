package com.smartmaps.ae.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.smartmaps.ae.ui.adaptive.SmDimens

/**
 * The SM mode cluster. Navigate / Transit / Plan are MODES, not tabs, not
 * sheets, not toolbar buttons: a floating cluster of square mode chips that
 * toggles the active mode (tap the active one to return to free-map).
 *
 * Adaptive behaviour:
 *   • phone  → horizontal compact cluster, docked above the card deck
 *   • tablet → vertical cluster on the right edge, larger chips
 * The chip never stretches — its size is a bucket dimen (fixes "mode cluster
 * stretching incorrectly" from the tablet screenshot).
 */
enum class SmMode { NAVIGATE, TRANSIT, PLAN }

@Composable
fun ModeCluster(
    active: SmMode?,
    onModeToggle: (SmMode) -> Unit,
    dimens: SmDimens,
    vertical: Boolean,
    modifier: Modifier = Modifier
) {
    val entries = listOf(
        Triple(SmMode.NAVIGATE, Icons.Filled.Navigation, "Navigate"),
        Triple(SmMode.TRANSIT, Icons.Filled.DirectionsBus, "Transit"),
        Triple(SmMode.PLAN, Icons.Filled.Route, "Plan")
    )
    if (vertical) {
        Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(dimens.clusterGap)) {
            entries.forEach { (mode, icon, label) ->
                ModeChip(mode, icon, label, active == mode, dimens) { onModeToggle(mode) }
            }
        }
    } else {
        Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(dimens.clusterGap)) {
            entries.forEach { (mode, icon, label) ->
                ModeChip(mode, icon, label, active == mode, dimens) { onModeToggle(mode) }
            }
        }
    }
}

@Composable
private fun ModeChip(
    mode: SmMode,
    icon: ImageVector,
    label: String,
    selected: Boolean,
    dimens: SmDimens,
    onClick: () -> Unit
) {
    val container =
        if (selected) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.surface
    val content =
        if (selected) MaterialTheme.colorScheme.onPrimary
        else MaterialTheme.colorScheme.primary

    Card(
        modifier = Modifier.size(dimens.clusterChip).clickable(onClick = onClick),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = container),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.size(dimens.clusterChip),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(icon, contentDescription = label, tint = content)
            if (dimens.isTablet) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = content
                )
            }
        }
    }
}
