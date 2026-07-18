package com.liuli.app.navigation

enum class AppIcon {
    Dashboard,
    EditNote,
    News,
    Alert,
    My,
}

enum class AppSection(val label: String, val icon: AppIcon) {
    Dashboard("看板", AppIcon.Dashboard),
    Notes("记录", AppIcon.EditNote),
    News("新闻", AppIcon.News),
    Alerts("预警", AppIcon.Alert),
    My("我的", AppIcon.My),
}

enum class DashboardTab(val label: String) {
    Today("今日"),
    Market("市场"),
    Track("赛道"),
    Stock("标的"),
    Portfolio("组合"),
}
