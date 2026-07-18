package com.liuli.app.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerEndpointTest {
    @Test
    fun `normalizes supported server addresses`() {
        assertEquals(
            "http://115.29.176.240:5173/",
            ServerEndpoint.parse("  http://115.29.176.240:5173  ").getOrThrow().value,
        )
        assertEquals(
            "https://example.com/liuli/",
            ServerEndpoint.parse("https://example.com/liuli").getOrThrow().value,
        )
    }

    @Test
    fun `rejects missing hosts and unsupported schemes`() {
        assertTrue(ServerEndpoint.parse("").isFailure)
        assertTrue(ServerEndpoint.parse("example.com").isFailure)
        assertTrue(ServerEndpoint.parse("ftp://example.com").isFailure)
        assertTrue(ServerEndpoint.parse("http:///api").isFailure)
    }
}
