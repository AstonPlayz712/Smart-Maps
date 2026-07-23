package com.smartmaps.ae

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.core.RoadGraph
import com.smartmaps.ae.ui.MapSurface
import com.smartmaps.ae.ui.adaptive.rememberSmDimens
import com.smartmaps.ae.ui.components.FloatingSearchBar
import com.smartmaps.ae.ui.components.LiveStateCard
import com.smartmaps.ae.ui.components.ModeCluster
import com.smartmaps.ae.ui.components.NavigateCard
import com.smartmaps.ae.ui.components.PlanCard
import com.smartmaps.ae.ui.components.SmMode
import com.smartmaps.ae.ui.components.TransitCard
import com.smartmaps.ae.ui.theme.SmartMapsTheme

/**
 * Smart Maps A/E app shell — the layered SM architecture:
 *
 *   1. MAP LAYER        MapSurface, owned HERE (the root), persistent,
 *                       full-screen. Destinations/modes never mount their
 *                       own map — they only change what floats above it.
 *   2. OVERLAY LAYER    contextual overlays (tracking chip in NavigateCard,
 *                       scale bar inside the map surface).
 *   3. CARD LAYER       modular dynamic cards (route / transit / plan) +
 *                       the Live State card. Phone: bottom stack.
 *                       Tablet: fixed-width left pane beside the rail.
 *   4. NAVIGATION LAYER the mode cluster (Navigate/Transit/Plan — modes,
 *                       not tabs) + app navigation (bottom bar on phone,
 *                       side rail on tablet).
 *   5. SYSTEM LAYER     app-level sections: Map ⇄ Diagnostics.
 *
 * Everything is state-driven from AECore flows; the layout bucket comes from
 * the sw600dp/sw720dp resource system via rememberSmDimens().
 */

private enum class AppSection { MAP, DIAGNOSTICS }

@Composable
fun SmartMapsApp(core: AECore) {
    SmartMapsTheme {
        val dimens = rememberSmDimens()

        val fix by core.fix.collectAsState()
        val snap by core.snap.collectAsState()
        val movement by core.movementState.collectAsState()
        val route by core.route.collectAsState()
        val nextStep by core.nextStep.collectAsState()
        val remainingM by core.remaining.collectAsState()
        val arrivals by core.arrivals.collectAsState()

        var section by remember { mutableStateOf(AppSection.MAP) }
        var activeMode by remember { mutableStateOf<SmMode?>(null) }
        var query by remember { mutableStateOf("") }

        Box(Modifier.fillMaxSize()) {
            // ── 1. MAP LAYER: persistent, full-screen, root-owned ─────────
            MapSurface(
                graph = core.spatial.graph(),
                route = route,
                position = fix?.point,
                headingDeg = fix?.headingDeg ?: 0.0,
                onRoad = snap?.onRoad == true,
                metersPerScreen = dimens.mapMetersPerScreen.toDouble(),
                modifier = Modifier.fillMaxSize()
            )

            if (dimens.sideNavigation) {
                // ══ TABLET (sw600dp / sw720dp) ═══════════════════════════
                Row(Modifier.fillMaxSize()) {
                    // NAVIGATION LAYER: side rail (NavigationRailItem is a
                    // plain composable — valid in the rail's ColumnScope)
                    NavigationRail {
                        APP_SECTIONS.forEach { (target, icon, label) ->
                            NavigationRailItem(
                                selected = section == target,
                                onClick = { section = target },
                                icon = { Icon(icon, contentDescription = label) },
                                label = { Text(label) }
                            )
                        }
                    }
                    // CARD LAYER: fixed-width pane — cards never stretch
                    Column(
                        Modifier
                            .width(dimens.cardPaneWidth)
                            .fillMaxHeight()
                            .padding(dimens.gridMacro)
                            .verticalScroll(rememberScrollState())
                    ) {
                        CardDeck(
                            core, section, activeMode, dimens,
                            route = route,
                            nextStep = nextStep,
                            remaining = remainingM,
                            arrivals = arrivals,
                            fixAvailable = fix != null,
                            trackingLabel = trackingLabel(core, fix != null, snap?.onRoad == true, snap?.edgeId),
                            onRoutePlanned = { activeMode = SmMode.NAVIGATE }
                        )
                        androidx.compose.foundation.layout.Spacer(Modifier.padding(dimens.gridMicro))
                        LiveStateCard(fix, movement, snap, dimens, expanded = section == AppSection.DIAGNOSTICS)
                    }
                    // Map breathing room; search floats top-centre of it
                    Box(Modifier.fillMaxSize()) {
                        FloatingSearchBar(
                            query, { query = it }, dimens,
                            Modifier
                                .align(Alignment.TopCenter)
                                .padding(dimens.gridMacro)
                        )
                        // NAVIGATION LAYER: vertical mode cluster, right edge
                        ModeCluster(
                            active = activeMode,
                            onModeToggle = { activeMode = if (activeMode == it) null else it },
                            dimens = dimens,
                            vertical = true,
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .padding(dimens.gridMacro)
                        )
                    }
                }
            } else {
                // ══ PHONE ════════════════════════════════════════════════
                Column(Modifier.fillMaxSize()) {
                    FloatingSearchBar(
                        query, { query = it }, dimens,
                        Modifier
                            .align(Alignment.CenterHorizontally)
                            .padding(
                                start = dimens.edgeMargin,
                                end = dimens.edgeMargin,
                                top = dimens.gridMacro
                            )
                    )
                    androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                    // Mode cluster: compact horizontal, docked above cards
                    ModeCluster(
                        active = activeMode,
                        onModeToggle = { activeMode = if (activeMode == it) null else it },
                        dimens = dimens,
                        vertical = false,
                        modifier = Modifier
                            .align(Alignment.End)
                            .padding(horizontal = dimens.edgeMargin)
                    )
                    // CARD LAYER: bottom stack
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(dimens.edgeMargin)
                    ) {
                        CardDeck(
                            core, section, activeMode, dimens,
                            route = route,
                            nextStep = nextStep,
                            remaining = remainingM,
                            arrivals = arrivals,
                            fixAvailable = fix != null,
                            trackingLabel = trackingLabel(core, fix != null, snap?.onRoad == true, snap?.edgeId),
                            onRoutePlanned = { activeMode = SmMode.NAVIGATE }
                        )
                        androidx.compose.foundation.layout.Spacer(Modifier.padding(dimens.gridMicro))
                        LiveStateCard(fix, movement, snap, dimens, expanded = section == AppSection.DIAGNOSTICS)
                    }
                    // NAVIGATION LAYER: bottom bar (NavigationBarItem is a
                    // RowScope extension — called here inside the bar's scope)
                    NavigationBar {
                        APP_SECTIONS.forEach { (target, icon, label) ->
                            NavigationBarItem(
                                selected = section == target,
                                onClick = { section = target },
                                icon = { Icon(icon, contentDescription = label) },
                                label = { Text(label) }
                            )
                        }
                    }
                }
            }
        }

    }
}

/** The modular card for the active mode (none → no mode card, map-first). */
@Composable
private fun CardDeck(
    core: AECore,
    section: AppSection,
    activeMode: SmMode?,
    dimens: com.smartmaps.ae.ui.adaptive.SmDimens,
    route: com.smartmaps.ae.core.Route?,
    nextStep: com.smartmaps.ae.core.RouteStep?,
    remaining: Pair<Double, Double>,
    arrivals: List<com.smartmaps.ae.core.TransitArrival>,
    fixAvailable: Boolean,
    trackingLabel: String,
    onRoutePlanned: () -> Unit
) {
    if (section == AppSection.DIAGNOSTICS) return // diagnostics = expanded Live State only
    when (activeMode) {
        SmMode.NAVIGATE -> NavigateCard(
            route = route,
            nextStep = nextStep,
            remainingM = remaining.first,
            remainingEtaS = remaining.second,
            trackingLabel = trackingLabel,
            dimens = dimens
        )
        SmMode.TRANSIT -> TransitCard(arrivals, dimens)
        SmMode.PLAN -> PlanCard(core, fixAvailable, route, dimens, onRoutePlanned)
        null -> Unit // free map — no mode card, the map breathes
    }
}

/** App-level sections (SM system layer). Shared by the phone bar + tablet rail. */
private val APP_SECTIONS = listOf(
    Triple(AppSection.MAP, Icons.Filled.Map, "Map"),
    Triple(AppSection.DIAGNOSTICS, Icons.Filled.Sensors, "Diagnostics")
)

private fun trackingLabel(core: AECore, hasFix: Boolean, onRoad: Boolean, edgeId: String?): String = when {
    !hasFix -> "Acquiring…"
    onRoad -> "On " + (roadName(core.spatial.graph(), edgeId) ?: "road")
    else -> "Off-road"
}

private fun roadName(graph: RoadGraph, edgeId: String?): String? =
    graph.edges.firstOrNull { it.id == edgeId }?.name
