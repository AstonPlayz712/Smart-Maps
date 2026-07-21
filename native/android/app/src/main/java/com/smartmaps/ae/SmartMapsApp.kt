package com.smartmaps.ae

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.smartmaps.ae.core.AECore
import com.smartmaps.ae.ui.HomeScreen
import com.smartmaps.ae.ui.JourneyPlannerScreen
import com.smartmaps.ae.ui.NavigationScreen
import com.smartmaps.ae.ui.TransitScreen
import com.smartmaps.ae.ui.theme.SmartMapsTheme

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("home", "Home", Icons.Filled.Home),
    Tab("navigate", "Navigate", Icons.Filled.Navigation),
    Tab("transit", "Transit", Icons.Filled.DirectionsBus),
    Tab("planner", "Plan", Icons.Filled.Route)
)

/** App shell: bottom bar + NavHost, all screens driven by the one AECore. */
@Composable
fun SmartMapsApp(core: AECore) {
    SmartMapsTheme {
        val navController = rememberNavController()
        val backStack by navController.currentBackStackEntryAsState()
        val currentRoute = backStack?.destination?.route

        Scaffold(
            bottomBar = {
                NavigationBar {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo("home")
                                    launchSingleTop = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) }
                        )
                    }
                }
            }
        ) { padding ->
            NavHost(
                navController = navController,
                startDestination = "home",
                modifier = Modifier.padding(padding)
            ) {
                composable("home") {
                    HomeScreen(
                        core = core,
                        onNavigate = { navController.navigate("navigate") },
                        onTransit = { navController.navigate("transit") },
                        onPlanner = { navController.navigate("planner") }
                    )
                }
                composable("navigate") { NavigationScreen(core) }
                composable("transit") { TransitScreen(core) }
                composable("planner") {
                    JourneyPlannerScreen(core) { navController.navigate("navigate") }
                }
            }
        }
    }
}
