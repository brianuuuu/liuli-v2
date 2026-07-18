package com.liuli.app.core.design

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = LiuliLightColors.accent,
    onPrimary = Color.White,
    primaryContainer = LiuliLightColors.accentMuted,
    onPrimaryContainer = Color(0xFF1E3A8A),
    secondary = LiuliLightColors.accent,
    onSecondary = Color.White,
    secondaryContainer = LiuliLightColors.accentMuted,
    onSecondaryContainer = Color(0xFF1E3A8A),
    tertiary = LiuliLightColors.accent,
    onTertiary = Color.White,
    tertiaryContainer = LiuliLightColors.accentMuted,
    onTertiaryContainer = Color(0xFF1E3A8A),
    background = LiuliLightColors.canvasSubtle,
    onBackground = LiuliLightColors.fgDefault,
    surface = LiuliLightColors.canvas,
    onSurface = LiuliLightColors.fgDefault,
    surfaceVariant = LiuliLightColors.canvasInset,
    onSurfaceVariant = LiuliLightColors.fgMuted,
    outline = LiuliLightColors.borderDefault,
    outlineVariant = LiuliLightColors.borderMuted,
    error = LiuliLightColors.danger,
    errorContainer = LiuliLightColors.dangerMuted,
)

private val DarkColors = darkColorScheme(
    primary = LiuliDarkColors.accent,
    onPrimary = Color(0xFF0D1117),
    primaryContainer = LiuliDarkColors.accentMuted,
    onPrimaryContainer = Color(0xFFDDF4FF),
    secondary = LiuliDarkColors.accent,
    onSecondary = Color(0xFF0D1117),
    secondaryContainer = LiuliDarkColors.accentMuted,
    onSecondaryContainer = Color(0xFFDDF4FF),
    tertiary = LiuliDarkColors.accent,
    onTertiary = Color(0xFF0D1117),
    tertiaryContainer = LiuliDarkColors.accentMuted,
    onTertiaryContainer = Color(0xFFDDF4FF),
    background = LiuliDarkColors.canvasSubtle,
    onBackground = LiuliDarkColors.fgDefault,
    surface = LiuliDarkColors.canvas,
    onSurface = LiuliDarkColors.fgDefault,
    surfaceVariant = LiuliDarkColors.canvasInset,
    onSurfaceVariant = LiuliDarkColors.fgMuted,
    outline = LiuliDarkColors.borderDefault,
    outlineVariant = LiuliDarkColors.borderMuted,
    error = LiuliDarkColors.danger,
    errorContainer = LiuliDarkColors.dangerMuted,
)

private val LiuliTypography = Typography(
    headlineSmall = TextStyle(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 18.sp, lineHeight = 22.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold),
    titleSmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 13.sp, lineHeight = 19.sp, fontWeight = FontWeight.Normal),
    bodyMedium = TextStyle(fontSize = 12.sp, lineHeight = 18.sp, fontWeight = FontWeight.Normal),
    bodySmall = TextStyle(fontSize = 10.5.sp, lineHeight = 16.sp, fontWeight = FontWeight.Normal),
    labelLarge = TextStyle(fontSize = 11.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 10.sp, lineHeight = 15.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 9.sp, lineHeight = 13.sp, fontWeight = FontWeight.Normal),
)

private val LiuliShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
)

val LocalLiuliColors = staticCompositionLocalOf { LiuliLightColors }

@Composable
fun LiuliTheme(
    themeMode: ThemeMode = ThemeMode.System,
    content: @Composable () -> Unit,
) {
    val dark = when (themeMode) {
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
        ThemeMode.System -> isSystemInDarkTheme()
    }
    val colors = if (dark) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
            WindowCompat.setDecorFitsSystemWindows(window, false)
        }
    }
    CompositionLocalProvider(LocalLiuliColors provides if (dark) LiuliDarkColors else LiuliLightColors) {
        MaterialTheme(
            colorScheme = colors,
            typography = LiuliTypography,
            shapes = LiuliShapes,
            content = content,
        )
    }
}
