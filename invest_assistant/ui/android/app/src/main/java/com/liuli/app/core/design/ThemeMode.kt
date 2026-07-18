package com.liuli.app.core.design

enum class ThemeMode(val storageValue: String, val label: String) {
    Light("light", "浅色"),
    Dark("dark", "深色"),
    System("system", "跟随系统");

    companion object {
        fun fromStorage(value: String?): ThemeMode =
            entries.firstOrNull { it.storageValue == value } ?: System
    }
}
