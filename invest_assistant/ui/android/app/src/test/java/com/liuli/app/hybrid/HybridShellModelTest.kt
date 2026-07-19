package com.liuli.app.hybrid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HybridShellModelTest {
    @Test
    fun `mobile url is derived from the configured server`() {
        assertEquals(
            "http://115.29.176.240:5173/mobile/",
            mobileAppUrl("http://115.29.176.240:5173/"),
        )
    }

    @Test
    fun `native sections keep the approved order and routes`() {
        assertEquals(
            listOf("看板", "笔记", "新闻", "预警", "我的"),
            HybridSection.entries.map { it.label },
        )
        assertEquals(
            listOf("dashboard", "notes", "news", "alerts", "me"),
            HybridSection.entries.map { it.route },
        )
    }

    @Test
    fun `only login and report reader hide the native bottom navigation`() {
        assertFalse(shouldShowBottomNavigation("/login"))
        assertFalse(shouldShowBottomNavigation("/reports/42"))
        assertTrue(shouldShowBottomNavigation("/reports"))
        assertTrue(shouldShowBottomNavigation("/news/42"))
    }
}
