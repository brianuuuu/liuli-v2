package com.liuli.app.core.common

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UiStateAndFormattingTest {
    @Test
    fun contentRetainsDataWhileRefreshing() {
        val state: UiState<List<Int>> = UiState.Content(listOf(1, 2), refreshing = true)

        assertEquals(listOf(1, 2), state.dataOrNull())
        assertTrue(state is UiState.Content && state.refreshing)
    }

    @Test
    fun fiveMinuteCacheExpiresAtBoundary() {
        assertTrue(CachePolicy.isFresh(savedAtMillis = 1_000L, nowMillis = 300_999L))
        assertFalse(CachePolicy.isFresh(savedAtMillis = 1_000L, nowMillis = 301_000L))
    }

    @Test
    fun investmentValuesUseChinesePresentationRules() {
        assertEquals("¥1,234.50万", formatMoneyWan(1234.5))
        assertEquals("+2.35%", formatSignedPercent(2.345))
        assertEquals(MarketTone.Rise, marketTone(0.01))
        assertEquals(MarketTone.Fall, marketTone(-0.01))
        assertEquals(MarketTone.Neutral, marketTone(null))
    }

    @Test
    fun networkErrorsDoNotExposeTransportEnglish() {
        assertEquals("网络连接中断，请重试", IOException("unexpected end of stream").toUiMessage())
    }
}
