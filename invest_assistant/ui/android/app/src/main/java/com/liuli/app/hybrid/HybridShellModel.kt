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

fun mobileAppUrl(server: String): String = "${server.trim().trimEnd('/')}/mobile/"

fun shouldShowBottomNavigation(path: String): Boolean =
    path != "/login" && !Regex("^/reports/\\d+$").matches(path)
