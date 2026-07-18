package com.liuli.app.feature.dashboard

import com.liuli.app.core.common.ProcessCache
import com.liuli.app.core.network.ApiSession
import com.liuli.app.core.network.MarketOverview
import com.liuli.app.core.network.TagHeatDto
import com.liuli.app.core.network.AlertStatsDto
import com.liuli.app.core.network.KnowledgeNoteDto
import com.liuli.app.core.network.PortfolioOverview
import com.liuli.app.core.network.ReportDto
import com.liuli.app.core.network.SourceItemDto
import com.liuli.app.core.network.StockDashboard
import com.liuli.app.core.network.TrackDashboard
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import javax.inject.Inject
import javax.inject.Singleton

data class TodayDashboard(
    val importantNews: List<SourceItemDto>,
    val reports: List<ReportDto>,
    val alerts: AlertStatsDto,
    val notes: List<KnowledgeNoteDto>,
)

data class MarketDashboard(
    val overview: MarketOverview,
    val rankings: List<TagHeatDto>,
)

@Singleton
class DashboardRepository @Inject constructor(
    private val session: ApiSession,
    private val cache: ProcessCache,
) {
    suspend fun today(force: Boolean = false): TodayDashboard =
        cached("dashboard.today", force) {
            coroutineScope {
                val news = async { session.api().newsData(limit = 4, importantOnly = true) }
                val reports = async { session.api().reportsData(limit = 4) }
                val alerts = async { session.api().alertStats() }
                val notes = async { session.api().notesData(limit = 3).items }
                TodayDashboard(news.await().items, reports.await().items, alerts.await(), notes.await())
            }
        }

    suspend fun market(force: Boolean = false): MarketDashboard =
        cached("dashboard.market", force) {
            coroutineScope {
                val overview = async { session.api().marketOverviewData() }
                val rankings = async { session.api().marketRankings() }
                MarketDashboard(overview.await(), rankings.await())
            }
        }

    suspend fun track(force: Boolean = false): TrackDashboard =
        cached("dashboard.track", force) { session.api().trackDashboardData() }

    suspend fun stock(force: Boolean = false): StockDashboard =
        cached("dashboard.stock", force) { session.api().stockDashboardData() }

    suspend fun portfolio(force: Boolean = false): Pair<PortfolioOverview, List<Double>> =
        cached("dashboard.portfolio", force) {
            coroutineScope {
                val overview = async { session.api().portfolioOverviewData() }
                val points = async { session.api().portfolioValueSnapshots().map { it.totalValue } }
                overview.await() to points.await()
            }
        }

    private suspend fun <T : Any> cached(key: String, force: Boolean, loader: suspend () -> T): T {
        if (!force) cache.get<T>(key)?.let { return it }
        return loader().also { cache.put(key, it) }
    }
}
