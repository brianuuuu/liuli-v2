package com.liuli.app.core.network

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BusinessDtosTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodesTrackDashboardUsingBackendFieldNames() {
        val value = json.decodeFromString<TrackDashboard>(
            """
            {
              "summary":{"warming_tracks_count":2,"focus_tracks_count":4,"pending_materials_count":3,
                "top_heat_track":{"track_id":8,"name":"国产算力","heat_score":92.6}},
              "heat_rankings":[{"rank":1,"track_id":8,"track_name":"国产算力","current_heat":92.6,
                "today_material_count":7,"pending_material_count":2,"rank_change_24h":1}],
              "focus_tracks":[],"latest_materials":[],"default_track_id":8,"analysis_summary":null
            }
            """.trimIndent(),
        )

        assertEquals("国产算力", value.summary.topHeatTrack?.name)
        assertEquals(92.6, value.heatRankings.first().currentHeat, 0.001)
        assertEquals(2, value.heatRankings.first().pendingMaterialCount)
    }

    @Test
    fun decodesStockAndPortfolioDashboardsWithoutJsonObjects() {
        val stock = json.decodeFromString<StockDashboard>(
            """{"summary":{"pool_count":12,"focused_count":5,"pending_materials_count":2,
            "top_score_stock":{"stock_id":1,"stock_name":"中际旭创","stock_code":"300308","total_score":88.5}},
            "score_trends":[],"valuation_trends":[],"score_rankings":[],"latest_valuations":[],
            "hot_stocks":[],"focus_stocks":[],"latest_materials":[],"pending_materials":[]}""",
        )
        val portfolio = json.decodeFromString<PortfolioOverview>(
            """{"scope":"all","portfolio_id":null,"portfolio_options":[],
            "summary":{"portfolio_count":2,"position_count":6,"position_market_value":800000,
            "cash_amount":200000,"total_value":1000000,"day_pnl":12000,"day_pct":1.2,"year_pnl":88000},
            "allocation_rows":[],"pie_items":[]}""",
        )

        assertEquals("中际旭创", stock.summary.topScoreStock?.stockName)
        assertEquals(1_000_000.0, portfolio.summary.totalValue, 0.001)
        assertTrue(portfolio.pieItems.isEmpty())
    }
}
