package com.liuli.app.hybrid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HybridShellModelTest {
    @Test
    fun `mobile url is derived from the configured server`() {
        assertEquals(
            "http://115.29.176.240:5174/",
            mobileAppUrl(" http://115.29.176.240:5174/ "),
        )
    }

    @Test
    fun `legacy public default is migrated without changing custom servers`() {
        assertEquals(
            "http://115.29.176.240:5174/",
            effectiveMobileServer(
                stored = "http://115.29.176.240:5173/",
                default = "http://115.29.176.240:5174/",
            ),
        )
        assertEquals(
            "http://192.168.1.8:5173/",
            effectiveMobileServer(
                stored = "http://192.168.1.8:5173/",
                default = "http://115.29.176.240:5174/",
            ),
        )
    }

    @Test
    fun `native sections keep the approved order and routes`() {
        assertEquals(
            listOf("看板", "资讯", "笔记", "待办", "我的"),
            HybridSection.entries.map { it.label },
        )
        assertEquals(
            listOf("dashboard", "news", "notes", "tasks", "me"),
            HybridSection.entries.map { it.route },
        )
    }

    @Test
    fun `only login and report reader hide the native bottom navigation`() {
        assertFalse(shouldShowBottomNavigation("/login"))
        assertFalse(shouldShowBottomNavigation("/reports/42"))
        assertTrue(shouldShowBottomNavigation("/reports"))
        assertTrue(shouldShowBottomNavigation("/tasks/alerts/42"))
    }
}
