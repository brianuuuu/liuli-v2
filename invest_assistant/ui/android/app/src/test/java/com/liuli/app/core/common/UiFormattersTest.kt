package com.liuli.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Test

class UiFormattersTest {
    @Test
    fun `iso timestamp is split into stable date and minute labels`() {
        assertEquals("2026-07-18", dateBucket("2026-07-18T10:20:31+08:00"))
        assertEquals("10:20", timeLabel("2026-07-18T10:20:31+08:00"))
        assertEquals("日期未知", dateBucket(null))
        assertEquals("--:--", timeLabel(""))
    }

    @Test
    fun `report kinds and alert statuses use fixed chinese labels`() {
        assertEquals("市场", reportKindLabel("market"))
        assertEquals("赛道", reportKindLabel("track"))
        assertEquals("标的", reportKindLabel("stock"))
        assertEquals("未读", alertStatusLabel("unread"))
        assertEquals("已读", alertStatusLabel("read"))
        assertEquals("已处理", alertStatusLabel("handled"))
    }
}
