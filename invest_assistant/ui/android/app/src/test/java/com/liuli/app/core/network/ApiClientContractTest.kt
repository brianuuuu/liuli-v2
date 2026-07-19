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

    @Test
    fun sendsExistingGroupAndTagsFieldsForQuickMemo() = runBlocking {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json")
                .setBody("""{"id":11,"title":"机器人订单","content":"机器人订单 #机器人","note_type":""}"""),
        )

        ApiClient.create(server.url("/").toString()).createNote(
            NoteCreateRequest(
                content = "机器人订单 #机器人",
                groupId = 3,
                tags = "#机器人",
            ),
        )

        val request = server.takeRequest()
        assertEquals("/api/knowledge/notes", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"group_id\":3"))
        assertTrue(body.contains("\"tags\":\"#机器人\""))
    }

    @Test
    fun updatesMemoThroughExistingPutEndpoint() = runBlocking {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json")
                .setBody("""{"id":11,"title":"机器人订单","content":"更新后的判断","note_type":"","group_id":3,"tags":[]}"""),
        )

        ApiClient.create(server.url("/").toString()).updateNote(
            11,
            NoteCreateRequest(
                content = "更新后的判断",
                groupId = 3,
                tagIds = listOf(8),
            ),
        )

        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("/api/knowledge/notes/11", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"group_id\":3"))
        assertTrue(body.contains("\"tag_ids\":[8]"))
    }
}
