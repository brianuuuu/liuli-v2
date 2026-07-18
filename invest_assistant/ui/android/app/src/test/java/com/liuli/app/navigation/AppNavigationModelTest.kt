package com.liuli.app.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

class AppNavigationModelTest {
    @Test
    fun `main navigation has five sections and dashboard has five tabs`() {
        assertEquals(listOf("看板", "记录", "新闻", "预警", "我的"), AppSection.entries.map { it.label })
        assertEquals(listOf("今日", "市场", "赛道", "标的", "组合"), DashboardTab.entries.map { it.label })
    }
}
