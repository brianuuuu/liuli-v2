package com.liuli.app.core.design

import androidx.compose.ui.graphics.Color

object LiuliDimensions {
    const val appBarHeightDp = 48
    const val bottomBarHeightDp = 56
    const val dashboardTabHeightDp = 40
    const val pageGutterDp = 12
    const val cardCornerDp = 10
    const val minimumTouchTargetDp = 48
}

data class LiuliSemanticColors(
    val canvas: Color,
    val canvasSubtle: Color,
    val canvasInset: Color,
    val borderDefault: Color,
    val borderMuted: Color,
    val fgDefault: Color,
    val fgMuted: Color,
    val accent: Color,
    val accentMuted: Color,
    val success: Color,
    val successMuted: Color,
    val attention: Color,
    val attentionMuted: Color,
    val danger: Color,
    val dangerMuted: Color,
    val done: Color,
    val doneMuted: Color,
)

val LiuliLightColors = LiuliSemanticColors(
    canvas = Color(0xFFFFFFFF),
    canvasSubtle = Color(0xFFF3F6FA),
    canvasInset = Color(0xFFF8FAFC),
    borderDefault = Color(0xFFE2E8F0),
    borderMuted = Color(0xFFEEF2F7),
    fgDefault = Color(0xFF0F172A),
    fgMuted = Color(0xFF64748B),
    accent = Color(0xFF2563EB),
    accentMuted = Color(0xFFEFF6FF),
    success = Color(0xFF059669),
    successMuted = Color(0xFFECFDF5),
    attention = Color(0xFFEA580C),
    attentionMuted = Color(0xFFFFF7ED),
    danger = Color(0xFFDC2626),
    dangerMuted = Color(0xFFFFF1F2),
    done = Color(0xFF2563EB),
    doneMuted = Color(0xFFEFF6FF),
)

val LiuliDarkColors = LiuliSemanticColors(
    canvas = Color(0xFF111820),
    canvasSubtle = Color(0xFF0D141C),
    canvasInset = Color(0xFF18212B),
    borderDefault = Color(0xFF2B3745),
    borderMuted = Color(0xFF202B37),
    fgDefault = Color(0xFFF1F5F9),
    fgMuted = Color(0xFF94A3B8),
    accent = Color(0xFF60A5FA),
    accentMuted = Color(0xFF172A46),
    success = Color(0xFF34D399),
    successMuted = Color(0xFF13342C),
    attention = Color(0xFFFB923C),
    attentionMuted = Color(0xFF3B2418),
    danger = Color(0xFFF87171),
    dangerMuted = Color(0xFF3B1C24),
    done = Color(0xFF60A5FA),
    doneMuted = Color(0xFF172A46),
)
