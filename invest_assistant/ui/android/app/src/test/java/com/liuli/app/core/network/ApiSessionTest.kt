package com.liuli.app.core.network

import com.liuli.app.core.common.ProcessCache
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ApiSessionTest {
    @Test
    fun emitsOneUnauthorizedEventAndClearsCacheWhenSessionChanges() = runBlocking {
        val server = MockWebServer().apply { start() }
        try {
            server.enqueue(MockResponse().setResponseCode(401))
            server.enqueue(MockResponse().setResponseCode(401))
            val cache = ProcessCache()
            val session = ApiSession(cache)
            session.configure(server.url("/").toString(), "old-token")
            cache.put("dashboard", "old")
            session.configure(server.url("/").toString(), "token")
            val unauthorized = async { withTimeout(2_000) { session.unauthorized.first() } }

            runCatching { session.api().marketOverviewData() }
            runCatching { session.api().marketOverviewData() }
            unauthorized.await()

            assertNull(cache.get<String>("dashboard"))
            assertEquals(2, server.requestCount)
        } finally {
            server.shutdown()
        }
    }
}
