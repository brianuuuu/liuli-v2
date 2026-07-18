package com.liuli.app.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException

class ApiClientContractTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun decodesTypedNewsPageAndSendsBearerToken() = runBlocking {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json").setBody(
                """{"items":[{"id":7,"source_type":"news","source_name":"财联社",
                "title":"算力产业链更新","content":"正文","source_tags":[]}],
                "total":1,"limit":50,"offset":0,"has_more":false}""",
            ),
        )

        val page = ApiClient.create(server.url("/").toString(), "token-1").newsData()

        assertEquals("算力产业链更新", page.items.single().title)
        assertEquals("Bearer token-1", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun exposesServerFailureAsHttpException() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(503).setBody("""{"detail":"unavailable"}"""))

        val failure = runCatching { ApiClient.create(server.url("/").toString()).marketOverviewData() }.exceptionOrNull()

        assertTrue(failure is HttpException)
        assertEquals(503, (failure as HttpException).code())
    }
}
