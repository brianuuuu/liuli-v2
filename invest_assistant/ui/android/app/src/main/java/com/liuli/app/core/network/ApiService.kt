package com.liuli.app.core.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String = "bearer",
)

@Serializable
data class UserMe(
    val id: Long,
    val username: String,
    @SerialName("display_name") val displayName: String? = null,
)

@Serializable
data class ChangePasswordRequest(
    @SerialName("old_password") val oldPassword: String,
    @SerialName("new_password") val newPassword: String,
)

@Serializable
data class OperationResult(val success: Boolean = true)

@Serializable
data class NoteCreateRequest(
    val title: String? = null,
    val content: String,
    @SerialName("note_type") val noteType: String = "thesis",
    @SerialName("related_module") val relatedModule: String? = null,
    @SerialName("related_id") val relatedId: Long? = null,
    val status: String = "active",
)

@Serializable
data class NoteResponse(
    val id: Long,
    val title: String,
    val content: String,
    @SerialName("note_type") val noteType: String = "",
)

interface ApiService {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): TokenResponse

    @GET("api/auth/me")
    suspend fun me(): UserMe

    @POST("api/auth/change-password")
    suspend fun changePassword(@Body request: ChangePasswordRequest): OperationResult

    @GET("api/market-radar/overview")
    suspend fun marketOverviewData(): MarketOverview

    @GET("api/market-radar/rankings")
    suspend fun marketRankings(
        @Query("type") type: String = "tag",
        @Query("window") window: String = "24h",
    ): List<TagHeatDto>

    @GET("api/track-discovery/dashboard")
    suspend fun trackDashboardData(): TrackDashboard

    @GET("api/stock-analysis/dashboard")
    suspend fun stockDashboardData(): StockDashboard

    @GET("api/portfolios/overview")
    suspend fun portfolioOverviewData(): PortfolioOverview

    @GET("api/portfolios/value-snapshots")
    suspend fun portfolioValueSnapshots(@Query("days") days: Int = 90): List<PortfolioValuePoint>

    @GET("api/market-radar/source-items")
    suspend fun newsData(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
        @Query("q") query: String? = null,
        @Query("source_name") sourceName: String? = null,
        @Query("important_only") importantOnly: Boolean = false,
        @Query("tag_id") tagId: Long? = null,
    ): PageDto<SourceItemDto>

    @GET("api/market-radar/source-items/{id}")
    suspend fun newsDetailData(@Path("id") id: Long): SourceItemDto

    @GET("api/knowledge/notes")
    suspend fun notesData(
        @Query("limit") limit: Int = 30,
        @Query("offset") offset: Int = 0,
        @Query("q") query: String? = null,
        @Query("status") status: String? = null,
    ): PageDto<KnowledgeNoteDto>

    @GET("api/knowledge/notes/{id}")
    suspend fun noteDetail(@Path("id") id: Long): KnowledgeNoteDto

    @POST("api/knowledge/notes")
    suspend fun createNote(@Body request: NoteCreateRequest): NoteResponse

    @GET("api/alerts/events")
    suspend fun alertsData(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
    ): PageDto<AlertEventDto>

    @GET("api/alerts/events/stats")
    suspend fun alertStats(): AlertStatsDto

    @GET("api/alerts/events/{id}")
    suspend fun alertDetailData(@Path("id") id: Long): AlertEventDto

    @POST("api/alerts/events/{id}/read")
    suspend fun markAlertRead(@Path("id") id: Long): AlertEventDto

    @POST("api/alerts/events/{id}/handle")
    suspend fun handleAlert(@Path("id") id: Long): AlertEventDto

    @GET("api/reports")
    suspend fun reportsData(
        @Query("limit") limit: Int = 30,
        @Query("offset") offset: Int = 0,
        @Query("report_kind") reportKind: String? = null,
    ): PageDto<ReportDto>

    @GET("api/reports/{id}")
    suspend fun reportDetailData(@Path("id") id: Long): ReportDto

    @GET("api/reports/{id}/content")
    suspend fun reportContent(@Path("id") id: Long): ResponseBody
}
