package com.liuli.app.core.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProcessCacheTest {
    @Test
    fun returnsOnlyFreshEntries() {
        val cache = ProcessCache(now = { 1_000L })
        cache.put("dashboard", "cached")

        assertEquals("cached", cache.get<String>("dashboard"))
        cache.now = { 1_000L + CachePolicy.PROCESS_CACHE_MILLIS }
        assertNull(cache.get<String>("dashboard"))
    }
}
