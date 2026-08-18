package com.smartmaps.ae.ui.adaptive

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.booleanResource
import androidx.compose.ui.res.dimensionResource
import androidx.compose.ui.res.integerResource
import androidx.compose.ui.unit.Dp
import com.smartmaps.ae.R

/**
 * Adaptive layer for the Smart Maps UI.
 *
 * Bucket selection uses `smallestScreenWidthDp` — the same axis the
 * values-sw600dp / values-sw720dp resource qualifiers key on — so the code
 * path and the resource system can never disagree (this is what fixes
 * "phone layout loading on tablet": there is exactly one source of truth
 * for the bucket, and the resources come from it automatically).
 */
enum class DeviceClass {
    PHONE,        // < 600dp smallest width (e.g. S25)
    TABLET,       // >= 600dp (e.g. Tab S6 Lite)
    TABLET_LARGE; // >= 720dp

    val isTablet: Boolean get() = this != PHONE
}

@Composable
@ReadOnlyComposable
fun deviceClass(): DeviceClass {
    val sw = LocalConfiguration.current.smallestScreenWidthDp
    return when {
        sw >= 720 -> DeviceClass.TABLET_LARGE
        sw >= 600 -> DeviceClass.TABLET
        else -> DeviceClass.PHONE
    }
}

/**
 * The resolved spacing grid + component metrics for the current bucket.
 * Every value comes from the qualified dimens.xml files, so density scaling
 * and bucket switching are handled by the Android resource system itself.
 */
data class SmDimens(
    val gridMicro: Dp,        // 8dp everywhere — the micro grid
    val gridMacro: Dp,        // 16dp phones / 24dp tablets — the macro grid
    val edgeMargin: Dp,
    val searchHeight: Dp,
    val searchMaxWidth: Dp,
    val clusterChip: Dp,
    val clusterGap: Dp,
    val cardCorner: Dp,
    val cardPaneWidth: Dp,
    val cardInnerPadding: Dp,
    val navIcon: Dp,
    val liveStateColumns: Int,
    val sideNavigation: Boolean,
    val mapMetersPerScreen: Int,
    val isTablet: Boolean
)

@Composable
fun rememberSmDimens(): SmDimens = SmDimens(
    gridMicro = dimensionResource(R.dimen.sm_grid_micro),
    gridMacro = dimensionResource(R.dimen.sm_grid_macro),
    edgeMargin = dimensionResource(R.dimen.sm_edge_margin),
    searchHeight = dimensionResource(R.dimen.sm_search_height),
    searchMaxWidth = dimensionResource(R.dimen.sm_search_max_width),
    clusterChip = dimensionResource(R.dimen.sm_cluster_chip),
    clusterGap = dimensionResource(R.dimen.sm_cluster_gap),
    cardCorner = dimensionResource(R.dimen.sm_card_corner),
    cardPaneWidth = dimensionResource(R.dimen.sm_card_pane_width),
    cardInnerPadding = dimensionResource(R.dimen.sm_card_inner_padding),
    navIcon = dimensionResource(R.dimen.sm_nav_icon),
    liveStateColumns = integerResource(R.integer.sm_live_state_columns),
    sideNavigation = booleanResource(R.bool.sm_side_navigation),
    mapMetersPerScreen = integerResource(R.integer.sm_map_meters_per_screen),
    isTablet = booleanResource(R.bool.sm_is_tablet)
)
