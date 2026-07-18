package com.liuli.app.core.design

import com.liuli.app.navigation.AppIcon
import com.liuli.app.navigation.AppSection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LiuliDesignSpecTest {
    @Test
    fun `mobile shell dimensions match approved prototype`() {
        assertEquals(48, LiuliDimensions.appBarHeightDp)
        assertEquals(56, LiuliDimensions.bottomBarHeightDp)
        assertEquals(40, LiuliDimensions.dashboardTabHeightDp)
        assertEquals(12, LiuliDimensions.pageGutterDp)
        assertEquals(10, LiuliDimensions.cardCornerDp)
        assertEquals(48, LiuliDimensions.minimumTouchTargetDp)
    }

    @Test
    fun `bottom navigation uses semantic icons instead of text abbreviations`() {
        assertEquals(
            listOf(AppIcon.Dashboard, AppIcon.EditNote, AppIcon.News, AppIcon.Alert, AppIcon.My),
            AppSection.entries.map { it.icon },
        )
        assertTrue(AppSection.entries.none { it.label.length > 2 })
    }
}
