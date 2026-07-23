package com.smartmaps.ae.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartmaps.ae.core.FixSource
import com.smartmaps.ae.core.FusedFix
import com.smartmaps.ae.core.MotionState
import com.smartmaps.ae.core.MovementEstimate
import com.smartmaps.ae.core.SnapResult
import com.smartmaps.ae.ui.adaptive.SmDimens

/**
 * Live State — Smart Maps' identity card. Always present, never collapsed:
 * coordinates, accuracy, motion state + confidence, sensor-fusion source
 * indicators, snap/link state, and the live update frequency.
 *
 * Adaptive behaviour: sm_live_state_columns = 1 on phones (compact rows),
 * 2 on tablets (two-column stat grid + fusion strip). The card has a fixed
 * inner structure — it can never render as the one-line strip from the
 * tablet screenshot.
 */
@Composable
fun LiveStateCard(
    fix: FusedFix?,
    movement: MovementEstimate,
    snap: SnapResult?,
    dimens: SmDimens,
    expanded: Boolean = false,
    modifier: Modifier = Modifier
) {
    // Live update frequency, derived from consecutive fused-fix timestamps.
    var lastTs by remember { mutableStateOf(0L) }
    var hz by remember { mutableStateOf(0.0) }
    LaunchedEffect(fix?.timestampMs) {
        val ts = fix?.timestampMs ?: return@LaunchedEffect
        if (lastTs in 1 until ts) hz = 1000.0 / (ts - lastTs)
        lastTs = ts
    }

    val stats = buildList {
        add("Position" to (fix?.let { "%.5f, %.5f".format(it.point.lat, it.point.lng) } ?: "acquiring…"))
        add("Accuracy" to (fix?.let { "±%.0f m".format(it.accuracyM) } ?: "—"))
        add("Motion" to motionLabel(movement))
        add("Confidence" to "%.0f%%".format(movement.confidence * 100))
        add("Link" to linkLabel(fix, snap))
        add("Update" to if (hz > 0) "%.1f Hz".format(hz) else "—")
        if (expanded) {
            add("Heading" to (fix?.let { "%.0f°".format(it.headingDeg) } ?: "—"))
            add("Speed" to (fix?.let { "%.1f m/s".format(it.speedMps) } ?: "—"))
            add("IMU energy" to "%.0f%%".format(movement.imuActivity * 100))
            add("Snap offset" to (snap?.let { "%.1f m".format(it.lateralOffsetM) } ?: "—"))
        }
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            Modifier.padding(dimens.cardInnerPadding),
            verticalArrangement = Arrangement.spacedBy(dimens.gridMicro)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Live state", style = MaterialTheme.typography.labelLarge)
            }

            if (dimens.liveStateColumns >= 2) {
                // Tablet: two-column stat grid.
                val rows = stats.chunked(2)
                rows.forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(dimens.gridMacro)) {
                        pair.forEach { (label, value) ->
                            StatCell(label, value, Modifier.weight(1f))
                        }
                        if (pair.size == 1) androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                    }
                }
            } else {
                // Phone: compact single-column rows.
                stats.forEach { (label, value) -> StatRow(label, value) }
            }

            // Sensor-fusion indicator strip: one dot per live source.
            FusionStrip(fix, dimens)
        }
    }
}

@Composable
private fun StatCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
        )
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
        )
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun FusionStrip(fix: FusedFix?, dimens: SmDimens) {
    val all = listOf(
        FixSource.GPS to "GPS",
        FixSource.WIFI to "Wi-Fi",
        FixSource.CELL to "Cell",
        FixSource.BLUETOOTH to "BT",
        FixSource.DEAD_RECKONING to "DR"
    )
    Row(
        horizontalArrangement = Arrangement.spacedBy(dimens.gridMicro),
        verticalAlignment = Alignment.CenterVertically
    ) {
        all.forEach { (source, label) ->
            val live = fix?.sources?.contains(source) == true
            Row(verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.foundation.layout.Box(
                    Modifier
                        .size(8.dp)
                        .background(
                            if (live) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f),
                            CircleShape
                        )
                )
                Text(
                    " $label",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (live) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                )
            }
        }
    }
}

private fun motionLabel(m: MovementEstimate): String = when (m.state) {
    MotionState.STILL -> "Still"
    MotionState.WALKING -> "Walking"
    MotionState.DRIVING -> "Driving"
    MotionState.UNKNOWN -> "Unknown"
}

private fun linkLabel(fix: FusedFix?, snap: SnapResult?): String = when {
    fix == null -> "no signal"
    fix.sources.contains(FixSource.DEAD_RECKONING) -> "dead-reckoning"
    snap?.onRoad == true -> "snapped"
    else -> "free"
}
