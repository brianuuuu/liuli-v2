package com.liuli.app.core.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PageDto<T>(
    val items: List<T> = emptyList(),
    val total: Int = 0,
    val limit: Int = 0,
    val offset: Int = 0,
    @SerialName("has_more") val hasMore: Boolean = false,
)

@Serializable
data class TagDto(
    val id: Long,
    val name: String,
    val type: String? = null,
    val status: String = "active",
)

@Serializable
data class SourceTagDto(
    val id: Long,
    @SerialName("tag_id") val tagId: Long,
    @SerialName("trigger_text") val triggerText: String? = null,
    val confidence: Double = 0.0,
    val tag: TagDto? = null,
)

@Serializable
data class SourceItemDto(
    val id: Long,
    @SerialName("source_type") val sourceType: String,
    @SerialName("source_name") val sourceName: String,
    val title: String,
    val content: String = "",
    @SerialName("source_url") val sourceUrl: String? = null,
    @SerialName("publish_time") val publishTime: String? = null,
    @SerialName("related_type") val relatedType: String? = null,
    @SerialName("related_id") val relatedId: Long? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("source_tags") val sourceTags: List<SourceTagDto> = emptyList(),
)

@Serializable
data class MarketOverview(
    @SerialName("source_items") val sourceItems: Int = 0,
    val tags: Int = 0,
    @SerialName("active_tags") val activeTags: Int = 0,
    @SerialName("ai_tag_suggestions") val aiTagSuggestions: Int = 0,
)

@Serializable
data class TagHeatDto(
    @SerialName("tag_id") val tagId: Long,
    @SerialName("window_type") val windowType: String = "24h",
    @SerialName("trigger_count") val triggerCount: Int = 0,
    @SerialName("source_count") val sourceCount: Int = 0,
    @SerialName("heat_score") val heatScore: Double = 0.0,
    @SerialName("rank_no") val rankNo: Int = 0,
    val tag: TagDto? = null,
)

@Serializable
data class TrackDashboard(
    val summary: TrackSummary = TrackSummary(),
    @SerialName("heat_rankings") val heatRankings: List<TrackRanking> = emptyList(),
    @SerialName("focus_tracks") val focusTracks: List<FocusTrack> = emptyList(),
    @SerialName("latest_materials") val latestMaterials: List<TrackMaterial> = emptyList(),
    @SerialName("default_track_id") val defaultTrackId: Long? = null,
    @SerialName("analysis_summary") val analysisSummary: TrackAnalysis? = null,
)

@Serializable
data class TrackSummary(
    @SerialName("warming_tracks_count") val warmingTracksCount: Int = 0,
    @SerialName("focus_tracks_count") val focusTracksCount: Int = 0,
    @SerialName("pending_materials_count") val pendingMaterialsCount: Int = 0,
    @SerialName("top_heat_track") val topHeatTrack: TopHeatTrack? = null,
)

@Serializable
data class TopHeatTrack(
    @SerialName("track_id") val trackId: Long,
    val name: String,
    @SerialName("heat_score") val heatScore: Double = 0.0,
)

@Serializable
data class TrackRanking(
    val rank: Int,
    @SerialName("track_id") val trackId: Long,
    @SerialName("track_name") val trackName: String,
    val status: String = "",
    @SerialName("current_heat") val currentHeat: Double = 0.0,
    @SerialName("today_material_count") val todayMaterialCount: Int = 0,
    @SerialName("confirmed_material_count") val confirmedMaterialCount: Int = 0,
    @SerialName("processed_material_count") val processedMaterialCount: Int = 0,
    @SerialName("pending_material_count") val pendingMaterialCount: Int = 0,
    @SerialName("rank_change_24h") val rankChange24h: Int? = null,
    @SerialName("rank_change_7d") val rankChange7d: Int? = null,
    @SerialName("rank_change_30d") val rankChange30d: Int? = null,
    val stage: String? = null,
    @SerialName("track_score") val trackScore: Double? = null,
)

@Serializable
data class FocusTrack(
    @SerialName("track_id") val trackId: Long,
    val name: String,
    @SerialName("track_score") val trackScore: Double? = null,
    @SerialName("current_view") val currentView: String? = null,
    val stage: String? = null,
    @SerialName("confidence_level") val confidenceLevel: String? = null,
    @SerialName("bound_stock_count") val boundStockCount: Int = 0,
    @SerialName("recent_material_count") val recentMaterialCount: Int = 0,
    @SerialName("current_heat") val currentHeat: Double = 0.0,
)

@Serializable
data class TrackMaterial(
    val id: Long,
    @SerialName("track_id") val trackId: Long,
    @SerialName("track_name") val trackName: String? = null,
    @SerialName("material_title") val materialTitle: String? = null,
    @SerialName("material_summary") val materialSummary: String? = null,
    @SerialName("material_source_name") val materialSourceName: String? = null,
    @SerialName("material_time") val materialTime: String? = null,
    val direction: String? = null,
    @SerialName("importance_level") val importanceLevel: String? = null,
    val status: String = "",
)

@Serializable
data class TrackAnalysis(
    @SerialName("track_id") val trackId: Long,
    @SerialName("track_name") val trackName: String,
    @SerialName("analysis_date") val analysisDate: String? = null,
    @SerialName("heat_summary") val heatSummary: String? = null,
    @SerialName("opportunity_points") val opportunityPoints: String? = null,
    @SerialName("risk_points") val riskPoints: String? = null,
    val score: Double? = null,
    @SerialName("confidence_level") val confidenceLevel: String? = null,
)

@Serializable
data class StockDashboard(
    val summary: StockSummary = StockSummary(),
    @SerialName("score_trends") val scoreTrends: List<StockScoreTrend> = emptyList(),
    @SerialName("valuation_trends") val valuationTrends: List<StockValuationTrend> = emptyList(),
    @SerialName("score_rankings") val scoreRankings: List<StockRanking> = emptyList(),
    @SerialName("latest_valuations") val latestValuations: List<StockValuation> = emptyList(),
    @SerialName("hot_stocks") val hotStocks: List<HotStock> = emptyList(),
    @SerialName("focus_stocks") val focusStocks: List<FocusStock> = emptyList(),
    @SerialName("latest_materials") val latestMaterials: List<StockMaterial> = emptyList(),
    @SerialName("pending_materials") val pendingMaterials: List<StockMaterial> = emptyList(),
)

@Serializable
data class StockSummary(
    @SerialName("pool_count") val poolCount: Int = 0,
    @SerialName("focused_count") val focusedCount: Int = 0,
    @SerialName("pending_materials_count") val pendingMaterialsCount: Int = 0,
    @SerialName("top_score_stock") val topScoreStock: TopScoreStock? = null,
)

@Serializable
data class TopScoreStock(
    @SerialName("stock_id") val stockId: Long,
    @SerialName("stock_name") val stockName: String? = null,
    @SerialName("stock_code") val stockCode: String? = null,
    @SerialName("total_score") val totalScore: Double? = null,
)

@Serializable
data class StockScorePoint(
    @SerialName("report_time") val reportTime: String,
    @SerialName("total_score") val totalScore: Double,
)

@Serializable
data class StockScoreTrend(
    @SerialName("stock_id") val stockId: Long,
    @SerialName("stock_name") val stockName: String? = null,
    val points: List<StockScorePoint> = emptyList(),
)

@Serializable
data class StockValuationPoint(
    @SerialName("analysis_date") val analysisDate: String,
    @SerialName("current_market_value") val currentMarketValue: Double? = null,
    @SerialName("expected_market_value_3y") val expectedMarketValue3y: Double? = null,
    @SerialName("expectation_gap_rate") val expectationGapRate: Double? = null,
)

@Serializable
data class StockValuationTrend(
    @SerialName("stock_id") val stockId: Long,
    @SerialName("stock_name") val stockName: String? = null,
    val points: List<StockValuationPoint> = emptyList(),
)

@Serializable
data class StockRanking(
    val rank: Int,
    @SerialName("stock_id") val stockId: Long,
    @SerialName("stock_name") val stockName: String? = null,
    @SerialName("stock_code") val stockCode: String? = null,
    @SerialName("investment_level") val investmentLevel: String? = null,
    @SerialName("total_score") val totalScore: Double? = null,
)

@Serializable
data class StockValuation(
    @SerialName("stock_id") val stockId: Long,
    @SerialName("stock_name") val stockName: String? = null,
    @SerialName("stock_code") val stockCode: String? = null,
    @SerialName("current_market_value") val currentMarketValue: Double? = null,
    @SerialName("expected_market_value_3y") val expectedMarketValue3y: Double? = null,
    @SerialName("expectation_gap_rate") val expectationGapRate: Double? = null,
    @SerialName("analysis_date") val analysisDate: String? = null,
)

@Serializable
data class HotStock(
    val rank: Int,
    @SerialName("stock_id") val stockId: Long,
    @SerialName("stock_name") val stockName: String? = null,
    @SerialName("stock_code") val stockCode: String? = null,
    @SerialName("source_item_count") val sourceItemCount: Int = 0,
    @SerialName("material_count") val materialCount: Int = 0,
)

@Serializable
data class FocusStock(
    @SerialName("stock_id") val stockId: Long,
    @SerialName("stock_name") val stockName: String? = null,
    @SerialName("stock_code") val stockCode: String? = null,
    val status: String = "",
    val reason: String? = null,
    @SerialName("latest_score") val latestScore: Double? = null,
    @SerialName("bound_track_count") val boundTrackCount: Int = 0,
    @SerialName("recent_material_count") val recentMaterialCount: Int = 0,
)

@Serializable
data class StockMaterial(
    val id: Long,
    @SerialName("stock_id") val stockId: Long? = null,
    @SerialName("stock_name") val stockName: String? = null,
    @SerialName("stock_code") val stockCode: String? = null,
    @SerialName("material_title") val materialTitle: String? = null,
    @SerialName("material_summary") val materialSummary: String? = null,
    val status: String = "",
)

@Serializable
data class PortfolioOverview(
    val scope: String,
    @SerialName("portfolio_id") val portfolioId: Long? = null,
    @SerialName("portfolio_options") val portfolioOptions: List<PortfolioOption> = emptyList(),
    val summary: PortfolioOverviewSummary = PortfolioOverviewSummary(),
    @SerialName("allocation_rows") val allocationRows: List<AllocationRow> = emptyList(),
    @SerialName("pie_items") val pieItems: List<AllocationRow> = emptyList(),
)

@Serializable
data class PortfolioOption(
    val id: Long,
    val name: String,
    @SerialName("base_currency") val baseCurrency: String = "CNY",
)

@Serializable
data class PortfolioOverviewSummary(
    @SerialName("portfolio_count") val portfolioCount: Int = 0,
    @SerialName("position_count") val positionCount: Int = 0,
    @SerialName("position_market_value") val positionMarketValue: Double = 0.0,
    @SerialName("cash_amount") val cashAmount: Double = 0.0,
    @SerialName("total_value") val totalValue: Double = 0.0,
    @SerialName("day_pnl") val dayPnl: Double = 0.0,
    @SerialName("day_pct") val dayPct: Double? = null,
    @SerialName("year_pnl") val yearPnl: Double? = null,
)

@Serializable
data class AllocationRow(
    val type: String,
    @SerialName("stock_id") val stockId: Long? = null,
    @SerialName("stock_code") val stockCode: String? = null,
    val label: String,
    @SerialName("market_value") val marketValue: Double = 0.0,
    val weight: Double? = null,
)

@Serializable
data class PortfolioValuePoint(
    @SerialName("snapshot_date") val snapshotDate: String,
    @SerialName("total_value") val totalValue: Double,
    @SerialName("position_market_value") val positionMarketValue: Double = 0.0,
    @SerialName("cash_amount") val cashAmount: Double = 0.0,
    @SerialName("day_pnl") val dayPnl: Double? = null,
    @SerialName("day_pct") val dayPct: Double? = null,
)

@Serializable
data class KnowledgeNoteDto(
    val id: Long,
    val title: String,
    val content: String,
    @SerialName("note_type") val noteType: String = "",
    @SerialName("related_module") val relatedModule: String? = null,
    @SerialName("related_id") val relatedId: Long? = null,
    val status: String = "active",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class AlertEventDto(
    val id: Long,
    @SerialName("rule_id") val ruleId: Long? = null,
    @SerialName("event_level") val eventLevel: String = "info",
    val title: String,
    val message: String,
    val status: String = "unread",
    @SerialName("event_time") val eventTime: String? = null,
)

@Serializable
data class AlertStatsDto(
    val total: Int = 0,
    val unread: Int = 0,
    val read: Int = 0,
    val handled: Int = 0,
)

@Serializable
data class ReportDto(
    val id: Long,
    val title: String,
    @SerialName("report_type") val reportType: String,
    @SerialName("source_module") val sourceModule: String,
    @SerialName("target_type") val targetType: String? = null,
    @SerialName("target_id") val targetId: Long? = null,
    val summary: String? = null,
    @SerialName("file_format") val fileFormat: String = "md",
    val status: String = "draft",
    @SerialName("publish_time") val publishTime: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)
