package com.liuli.app.hybrid

enum class HybridSection(
    val label: String,
    val route: String,
) {
    Dashboard("看板", "dashboard"),
    Notes("笔记", "notes"),
    News("新闻", "news"),
    Alerts("预警", "alerts"),
    Me("我的", "me"),
}

fun mobileAppUrl(server: String): String = "${server.trim().trimEnd('/')}/"

fun effectiveMobileServer(stored: String?, default: String): String {
    val normalizedStored = stored?.trim()?.trimEnd('/')
    return if (normalizedStored == "http://115.29.176.240:5173") default else stored ?: default
}

fun shouldShowBottomNavigation(path: String): Boolean =
    path != "/login" && !Regex("^/reports/\\d+$").matches(path)
