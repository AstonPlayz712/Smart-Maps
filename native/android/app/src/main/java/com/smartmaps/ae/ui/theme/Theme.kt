package com.smartmaps.ae.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Smart Maps A/E palette — deep navigation blues with a corridor-glow accent,
// matching the Zante day/night tones from the reference app.

private val DarkColors = darkColorScheme(
    primary = Color(0xFF4FC3F7),
    onPrimary = Color(0xFF06202E),
    secondary = Color(0xFF80DEEA),
    background = Color(0xFF0A0F1C),
    surface = Color(0xFF121A2E),
    onBackground = Color(0xFFE3EAF6),
    onSurface = Color(0xFFE3EAF6)
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF0277BD),
    onPrimary = Color.White,
    secondary = Color(0xFF00838F),
    background = Color(0xFFF4F7FC),
    surface = Color.White,
    onBackground = Color(0xFF16213A),
    onSurface = Color(0xFF16213A)
)

@Composable
fun SmartMapsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content
    )
}
