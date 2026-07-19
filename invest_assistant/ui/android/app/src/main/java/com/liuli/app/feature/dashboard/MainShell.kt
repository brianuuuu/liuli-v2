package com.liuli.app.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.liuli.app.core.common.UiState
import com.liuli.app.core.common.formatCompactCount
import com.liuli.app.core.common.formatMoney
import com.liuli.app.core.common.formatSignedPercent
import com.liuli.app.core.design.DonutChart
import com.liuli.app.core.design.EmptyPane
import com.liuli.app.core.design.ErrorPane
import com.liuli.app.core.design.LiuliAppBar
import com.liuli.app.core.design.LiuliCard
import com.liuli.app.core.design.LiuliDimensions
import com.liuli.app.core.design.LiuliListCard
import com.liuli.app.core.design.LiuliListRow
import com.liuli.app.core.design.LoadingPane
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.design.MetricTile
import com.liuli.app.core.design.MiniLineChart
import com.liuli.app.core.design.SectionHeader
import com.liuli.app.core.design.StatusPill
import com.liuli.app.core.design.ThemeMode
import com.liuli.app.core.network.ApiService
import com.liuli.app.core.network.PortfolioOverview
import com.liuli.app.core.network.ReportDto
import com.liuli.app.core.network.SourceItemDto
import com.liuli.app.core.network.StockDashboard
import com.liuli.app.core.network.StockRanking
import com.liuli.app.core.network.TrackDashboard
import com.liuli.app.core.network.TrackRanking
import com.liuli.app.feature.alerts.AlertsScreen
import com.liuli.app.feature.news.NewsScreen
import com.liuli.app.feature.notes.NotesScreen
import com.liuli.app.feature.notes.NoteComposerContext
import com.liuli.app.feature.reports.ReportsScreen
import com.liuli.app.feature.settings.SettingsScreen
import com.liuli.app.navigation.AppIcon
import com.liuli.app.navigation.AppSection
import com.liuli.app.navigation.DashboardTab
import kotlinx.coroutines.launch

@Composable
fun MainShell(
    api: ApiService,
    offlineMessage: String?,
    server: String,
    themeMode: ThemeMode,
    onThemeChange: (ThemeMode) -> Unit,
    onEditServer: () -> Unit,
    onLogout: () -> Unit,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val route = backStackEntry?.destination?.route.orEmpty()
    val section = AppSection.entries.firstOrNull { route == it.name.lowercase() } ?: AppSection.Dashboard
    val secondary = route.startsWith("reports/")
    var newsDetailOpen by remember { mutableStateOf(false) }
    var noteComposerContext by remember { mutableStateOf<NoteComposerContext?>(null) }
    LaunchedEffect(route) {
        if (route != AppSection.News.name.lowercase()) newsDetailOpen = false
    }
    val writeContextNote: (String, Long?, String) -> Unit = { module, relatedId, title ->
        noteComposerContext = NoteComposerContext(
            relatedModule = module,
            relatedId = relatedId,
            initialText = title,
        )
        navController.navigate(AppSection.Notes.name.lowercase()) {
            launchSingleTop = true
            restoreState = true
        }
    }

    Scaffold(
        containerColor = LocalLiuliColors.current.canvasSubtle,
        bottomBar = {
            if (!secondary && !newsDetailOpen) {
                Column(
                    modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).navigationBarsPadding(),
                ) {
                    androidx.compose.material3.HorizontalDivider(color = LocalLiuliColors.current.borderDefault)
                    Row(Modifier.fillMaxWidth().height(LiuliDimensions.bottomBarHeightDp.dp)) {
                        AppSection.entries.forEach { item ->
                            val selected = section == item
                            Column(
                                modifier = Modifier.weight(1f).fillMaxHeight().clickable {
                                navController.navigate(item.name.lowercase()) {
                                    popUpTo(AppSection.Dashboard.name.lowercase()) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                                },
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center,
                            ) {
                                Box(
                                    modifier = Modifier.size(width = 28.dp, height = 23.dp).background(
                                        if (selected) LocalLiuliColors.current.accentMuted else Color.Transparent,
                                        RoundedCornerShape(7.dp),
                                    ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                Icon(
                                    when (item.icon) {
                                        AppIcon.Dashboard -> Icons.Outlined.Assessment
                                        AppIcon.EditNote -> Icons.Outlined.EditNote
                                        AppIcon.News -> Icons.Outlined.Newspaper
                                        AppIcon.Alert -> Icons.Outlined.NotificationsNone
                                        AppIcon.My -> Icons.Outlined.PersonOutline
                                    },
                                    contentDescription = item.label,
                                        modifier = Modifier.size(19.dp),
                                        tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    item.label,
                                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                    modifier = Modifier.padding(top = 2.dp),
                                )
                            }
                        }
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = AppSection.Dashboard.name.lowercase(),
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            composable(AppSection.Dashboard.name.lowercase()) {
                DashboardScreen(
                    offlineMessage = offlineMessage,
                    onOpenReports = { kind ->
                        navController.navigate("reports/${kind ?: "all"}")
                    },
                    onWriteNote = writeContextNote,
                )
            }
            composable(AppSection.Notes.name.lowercase()) {
                NotesScreen(
                    api = api,
                    initialComposerContext = noteComposerContext,
                    onComposerContextConsumed = { noteComposerContext = null },
                )
            }
            composable(AppSection.News.name.lowercase()) {
                NewsScreen(
                    api = api,
                    onWriteNote = writeContextNote,
                    onDetailVisibilityChange = { newsDetailOpen = it },
                )
            }
            composable(AppSection.Alerts.name.lowercase()) { AlertsScreen(api, writeContextNote) }
            composable(AppSection.My.name.lowercase()) {
                SettingsScreen(
                    api = api,
                    server = server,
                    themeMode = themeMode,
                    onThemeChange = onThemeChange,
                    onEditServer = onEditServer,
                    onBack = {},
                    onLogout = onLogout,
                    showAppBar = false,
                )
            }
            composable("reports/{kind}") { entry ->
                val kind = entry.arguments?.getString("kind").takeUnless { it == "all" }
                ReportsScreen(api, kind, { navController.popBackStack() }, writeContextNote)
            }
        }
    }
}

@Composable
private fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    offlineMessage: String?,
    onOpenReports: (String?) -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    var detail by remember { mutableStateOf<DashboardDetail?>(null) }
    if (detail != null) {
        DashboardDetailScreen(detail!!, onBack = { detail = null }, onWriteNote = onWriteNote)
        return
    }
    val pager = rememberPagerState(pageCount = { DashboardTab.entries.size })
    val scope = rememberCoroutineScope()
    LaunchedEffect(pager.currentPage) { viewModel.load(pager.currentPage) }
    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().height(LiuliDimensions.dashboardTabHeightDp.dp)
                .background(MaterialTheme.colorScheme.surface),
        ) {
            DashboardTab.entries.forEachIndexed { index, item ->
                val selected = index == pager.currentPage
                Box(
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .clickable { scope.launch { pager.animateScrollToPage(index) } },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        item.label,
                        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    )
                    if (selected) {
                        Box(
                            Modifier.align(Alignment.BottomCenter).width(28.dp).height(2.dp)
                                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp)),
                        )
                    }
                }
            }
        }
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize(), beyondViewportPageCount = 1) { page ->
            when (page) {
                0 -> StatePane(viewModel.today.collectAsStateWithLifecycle().value, { viewModel.load(0, true) }) {
                    TodayPanel(
                        data = it,
                        offlineMessage = offlineMessage,
                        onOpenReports = onOpenReports,
                    ) { onWriteNote("knowledge_base", null, "快速记录") }
                }
                1 -> StatePane(viewModel.market.collectAsStateWithLifecycle().value, { viewModel.load(1, true) }) {
                    MarketPanel(it, onOpenReports)
                }
                2 -> StatePane(viewModel.track.collectAsStateWithLifecycle().value, { viewModel.load(2, true) }) {
                    TrackPanel(it, onOpenReports) { row -> detail = DashboardDetail.Track(row) }
                }
                3 -> StatePane(viewModel.stock.collectAsStateWithLifecycle().value, { viewModel.load(3, true) }) {
                    StockPanel(it, onOpenReports) { row -> detail = DashboardDetail.Stock(row) }
                }
                else -> StatePane(viewModel.portfolio.collectAsStateWithLifecycle().value, { viewModel.load(4, true) }) {
                    PortfolioPanel(it.first, it.second) { detail = DashboardDetail.Portfolio(it.first) }
                }
            }
        }
    }
}

@Composable
private fun <T> StatePane(state: UiState<T>, retry: () -> Unit, content: @Composable (T) -> Unit) {
    when (state) {
        UiState.Loading -> LoadingPane()
        is UiState.Empty -> EmptyPane("暂无数据", state.message)
        is UiState.Error -> ErrorPane(state.message, if (state.canRetry) retry else null)
        is UiState.Content -> Box {
            content(state.data)
            if (state.refreshing) {
                Text(
                    "刷新中…",
                    modifier = Modifier.align(Alignment.TopCenter).background(MaterialTheme.colorScheme.primaryContainer)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

@Composable
private fun TodayPanel(
    data: TodayDashboard,
    offlineMessage: String?,
    onOpenReports: (String?) -> Unit,
    onQuickNote: () -> Unit,
) {
    DashboardList {
        item {
            LiuliCard(
                modifier = Modifier.fillMaxWidth(),
                containerColor = LocalLiuliColors.current.accentMuted.copy(alpha = 0.55f),
                borderColor = LocalLiuliColors.current.accent.copy(alpha = 0.28f),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("早上好，Brian", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            "今天有 ${data.importantNews.size + data.alerts.unread + data.reports.size} 项值得关注",
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        Text(
                            "${data.importantNews.size} 条重要信息 · ${data.alerts.unread} 条预警 · ${data.reports.size} 份新报告",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Surface(
                        onClick = onQuickNote,
                        modifier = Modifier.size(38.dp),
                        color = MaterialTheme.colorScheme.primary,
                        shape = RoundedCornerShape(12.dp),
                        shadowElevation = 5.dp,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.Add, contentDescription = "快速记录", tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                    }
                }
                if (!offlineMessage.isNullOrBlank()) {
                    Text(
                        offlineMessage,
                        modifier = Modifier.padding(top = 7.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = LocalLiuliColors.current.attention,
                    )
                }
            }
        }
        item { SectionHeader("今日摘要") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("重要新闻", data.importantNews.size.toString(), "今日优先阅读", modifier = Modifier.weight(1f))
                MetricTile(
                    "未读预警",
                    data.alerts.unread.toString(),
                    "待处理 ${data.alerts.unread + data.alerts.read}",
                    valueColor = if (data.alerts.unread > 0) LocalLiuliColors.current.danger else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("最新报告", data.reports.size.toString(), "研究结论归档", modifier = Modifier.weight(1f))
                MetricTile("最近笔记", data.notes.size.toString(), "继续沉淀判断", modifier = Modifier.weight(1f))
            }
        }
        if (data.importantNews.isNotEmpty()) {
            item { SectionHeader("优先处理") }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    data.importantNews.take(3).forEachIndexed { index, news ->
                        LiuliListRow(
                            title = news.title,
                            subtitle = "${news.sourceName} · ${news.publishTime?.take(16)?.replace('T', ' ').orEmpty()}",
                            leading = {
                                Box(Modifier.size(7.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(50)))
                            },
                            showDivider = index != data.importantNews.take(3).lastIndex,
                        )
                    }
                }
            }
        }
        item { SectionHeader("最新报告", "全部报告", onAction = { onOpenReports(null) }) }
        if (data.reports.isNotEmpty()) {
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    data.reports.take(3).forEachIndexed { index, report ->
                        LiuliListRow(
                            title = report.title,
                            subtitle = report.summary ?: "${report.sourceModule} · ${report.status}",
                            onClick = { onOpenReports(null) },
                            showDivider = index != data.reports.take(3).lastIndex,
                        )
                    }
                }
            }
        }
        if (data.notes.isNotEmpty()) {
            item { SectionHeader("最近笔记") }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    data.notes.take(3).forEachIndexed { index, note ->
                        LiuliListRow(
                            title = note.title,
                            subtitle = note.content.replace("\n", " "),
                            showDivider = index != data.notes.take(3).lastIndex,
                        )
                    }
                }
            }
        }
        item {
            LiuliCard(
                modifier = Modifier.fillMaxWidth().clickable(onClick = onQuickNote),
                containerColor = LocalLiuliColors.current.canvasInset,
                borderColor = LocalLiuliColors.current.borderMuted,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.EditNote, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("快速记录", fontWeight = FontWeight.SemiBold)
                        Text("把此刻的判断沉淀为知识笔记", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun MarketPanel(data: MarketDashboard, onOpenReports: (String?) -> Unit) {
    val overview = data.overview
    val rankings = data.rankings.sortedBy { it.rankNo }.take(8)
    val maxHeat = rankings.maxOfOrNull { it.heatScore }?.takeIf { it > 0.0 } ?: 1.0
    DashboardList {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("信息总量", formatCompactCount(overview.sourceItems.toLong()), "已归档", modifier = Modifier.weight(1f))
                MetricTile("活跃标签", overview.activeTags.toString(), "共 ${overview.tags}", modifier = Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("热榜标签", rankings.size.toString(), "近 24 小时", modifier = Modifier.weight(1f))
                MetricTile("待确认", overview.aiTagSuggestions.toString(), "AI 标签建议", modifier = Modifier.weight(1f))
            }
        }
        if (rankings.isNotEmpty()) item {
            LiuliCard(Modifier.fillMaxWidth()) {
                SectionHeader("市场热度分布")
                Spacer(Modifier.height(8.dp))
                rankings.take(5).forEach { row ->
                    HeatBar(row.tag?.name ?: "标签 #${row.tagId}", (row.heatScore / maxHeat).toFloat())
                }
            }
        }
        if (rankings.isNotEmpty()) {
            item { SectionHeader("标签排行") }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    rankings.forEachIndexed { index, row ->
                        RankingListRow(
                            rank = row.rankNo,
                            title = row.tag?.name ?: "标签 #${row.tagId}",
                            subtitle = "${row.sourceCount} 个来源 · ${row.triggerCount} 次触发",
                            value = row.heatScore.toInt().toString(),
                            badge = row.windowType,
                            onClick = {},
                            showDivider = index != rankings.lastIndex,
                        )
                    }
                }
            }
        }
        item { SectionHeader("研究入口", "市场报告", onAction = { onOpenReports("market") }) }
    }
}

@Composable
private fun TrackPanel(data: TrackDashboard, onOpenReports: (String?) -> Unit, onOpenDetail: (TrackRanking) -> Unit) {
    DashboardList {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("升温赛道", data.summary.warmingTracksCount.toString(), "24 小时", modifier = Modifier.weight(1f))
                MetricTile("重点跟踪", data.summary.focusTracksCount.toString(), "持续观察", modifier = Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("待处理", data.summary.pendingMaterialsCount.toString(), "赛道材料", modifier = Modifier.weight(1f))
                MetricTile(
                    "最高热度",
                    data.summary.topHeatTrack?.heatScore?.toInt()?.toString() ?: "--",
                    data.summary.topHeatTrack?.name,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        item { SectionHeader("赛道热度排行", "赛道报告", onAction = { onOpenReports("track") }) }
        if (data.heatRankings.isNotEmpty()) {
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    data.heatRankings.take(8).forEachIndexed { index, row ->
                        RankingListRow(
                            rank = row.rank,
                            title = row.trackName,
                            subtitle = "热度 ${row.currentHeat.toInt()} · 今日 ${row.todayMaterialCount} 条",
                            value = when {
                                (row.rankChange24h ?: 0) > 0 -> "↑${row.rankChange24h}"
                                (row.rankChange24h ?: 0) < 0 -> "↓${kotlin.math.abs(row.rankChange24h ?: 0)}"
                                else -> "—"
                            },
                            badge = row.stage,
                            onClick = { onOpenDetail(row) },
                            showDivider = index != data.heatRankings.take(8).lastIndex,
                        )
                    }
                }
            }
        }
        if (data.latestMaterials.isNotEmpty()) {
            item { SectionHeader("最新材料") }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    data.latestMaterials.take(4).forEachIndexed { index, material ->
                        LiuliListRow(
                            title = material.materialTitle ?: "未命名材料",
                            subtitle = "${material.trackName.orEmpty()} · ${material.materialSourceName.orEmpty()}",
                            showDivider = index != data.latestMaterials.take(4).lastIndex,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StockPanel(data: StockDashboard, onOpenReports: (String?) -> Unit, onOpenDetail: (StockRanking) -> Unit) {
    val scoreValues = data.scoreTrends.firstOrNull()?.points?.map { it.totalScore.toFloat() }.orEmpty()
    DashboardList {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("标的池", data.summary.poolCount.toString(), "重点 ${data.summary.focusedCount}", modifier = Modifier.weight(1f))
                MetricTile("最高评分", data.summary.topScoreStock?.totalScore?.toInt()?.toString() ?: "--", data.summary.topScoreStock?.stockName, modifier = Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("待处理材料", data.summary.pendingMaterialsCount.toString(), "等待研究", modifier = Modifier.weight(1f))
                MetricTile("热度标的", data.hotStocks.size.toString(), "近期关注", modifier = Modifier.weight(1f))
            }
        }
        if (scoreValues.isNotEmpty()) {
            item {
                LiuliCard(Modifier.fillMaxWidth()) {
                    SectionHeader("评分趋势")
                    MiniLineChart(scoreValues)
                }
            }
        }
        item { SectionHeader("评分排行", "标的报告", onAction = { onOpenReports("stock") }) }
        if (data.scoreRankings.isNotEmpty()) {
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    data.scoreRankings.take(8).forEachIndexed { index, row ->
                        RankingListRow(
                            row.rank,
                            row.stockName ?: row.stockCode ?: "未命名标的",
                            row.stockCode.orEmpty(),
                            row.totalScore?.toInt()?.toString() ?: "--",
                            row.investmentLevel,
                            onClick = { onOpenDetail(row) },
                            showDivider = index != data.scoreRankings.take(8).lastIndex,
                        )
                    }
                }
            }
        }
        if (data.latestValuations.isNotEmpty()) {
            item { SectionHeader("最新估值") }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    data.latestValuations.take(4).forEachIndexed { index, valuation ->
                        LiuliListRow(
                            title = valuation.stockName ?: valuation.stockCode ?: "标的",
                            subtitle = "三年空间 ${formatSignedPercent(valuation.expectationGapRate)} · ${valuation.analysisDate.orEmpty()}",
                            showDivider = index != data.latestValuations.take(4).lastIndex,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PortfolioPanel(data: PortfolioOverview, values: List<Double>, onOpenDetail: () -> Unit) {
    val palette = listOf(LocalLiuliColors.current.accent, LocalLiuliColors.current.done, LocalLiuliColors.current.attention, LocalLiuliColors.current.success)
    DashboardList {
        item {
            LiuliCard(Modifier.fillMaxWidth().clickable(onClick = onOpenDetail)) {
                Text("组合总资产", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(formatMoney(data.summary.totalValue), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
                Text("今日 ${formatSignedPercent(data.summary.dayPct)}  ·  盈亏 ${formatMoney(data.summary.dayPnl)}", color = if ((data.summary.dayPct ?: 0.0) >= 0) LocalLiuliColors.current.danger else LocalLiuliColors.current.success)
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricTile("持仓市值", formatMoney(data.summary.positionMarketValue), "${data.summary.positionCount} 个标的", modifier = Modifier.weight(1f))
                MetricTile("现金", formatMoney(data.summary.cashAmount), "${data.summary.portfolioCount} 个组合", modifier = Modifier.weight(1f))
            }
        }
        if (values.size > 1) {
            item {
                LiuliCard(Modifier.fillMaxWidth()) {
                    SectionHeader("资产价值曲线")
                    MiniLineChart(values.map(Double::toFloat))
                }
            }
        }
        item {
            LiuliCard(Modifier.fillMaxWidth()) {
                SectionHeader("资产分布")
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    DonutChart(data.pieItems.take(4).mapIndexed { index, row -> row.marketValue.toFloat() to palette[index % palette.size] })
                    Column(Modifier.padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        data.pieItems.take(4).forEachIndexed { index, row ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(8.dp).background(palette[index % palette.size]))
                                Text(row.label, modifier = Modifier.padding(start = 7.dp), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardList(content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(LiuliDimensions.pageGutterDp.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

@Composable
private fun RankingRow(rank: Int, title: String, subtitle: String, value: String, badge: String?, onClick: () -> Unit = {}) {
    LiuliCard(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(rank.toString().padStart(2, '0'), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, modifier = Modifier.width(30.dp))
            Column(Modifier.weight(1f)) {
                Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            if (!badge.isNullOrBlank()) StatusPill(badge)
            Text(value, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun RankingListRow(
    rank: Int,
    title: String,
    subtitle: String,
    value: String,
    badge: String?,
    onClick: () -> Unit,
    showDivider: Boolean,
) {
    LiuliListRow(
        title = title,
        subtitle = subtitle,
        leading = {
            Box(
                modifier = Modifier.size(22.dp).background(
                    if (rank in 1..3) LocalLiuliColors.current.dangerMuted else LocalLiuliColors.current.canvasInset,
                    RoundedCornerShape(6.dp),
                ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    rank.toString(),
                    color = if (rank in 1..3) LocalLiuliColors.current.danger else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
        },
        trailing = {
            Column(horizontalAlignment = Alignment.End) {
                Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.ExtraBold)
                if (!badge.isNullOrBlank()) {
                    Text(
                        badge,
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        },
        onClick = onClick,
        showDivider = showDivider,
    )
}

private sealed interface DashboardDetail {
    data class Track(val value: TrackRanking) : DashboardDetail
    data class Stock(val value: StockRanking) : DashboardDetail
    data class Portfolio(val value: PortfolioOverview) : DashboardDetail
}

@Composable
private fun DashboardDetailScreen(
    detail: DashboardDetail,
    onBack: () -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    val title = when (detail) {
        is DashboardDetail.Track -> detail.value.trackName
        is DashboardDetail.Stock -> detail.value.stockName ?: detail.value.stockCode ?: "标的详情"
        is DashboardDetail.Portfolio -> "组合详情"
    }
    val module = when (detail) {
        is DashboardDetail.Track -> "track_discovery"
        is DashboardDetail.Stock -> "stock_analysis"
        is DashboardDetail.Portfolio -> "portfolio"
    }
    val id = when (detail) {
        is DashboardDetail.Track -> detail.value.trackId
        is DashboardDetail.Stock -> detail.value.stockId
        is DashboardDetail.Portfolio -> detail.value.portfolioId
    }
    Column(Modifier.fillMaxSize()) {
        LiuliAppBar(title, "移动端摘要", onBack = onBack)
        LazyColumn(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            when (detail) {
                is DashboardDetail.Track -> {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile("当前热度", detail.value.currentHeat.toInt().toString(), "排名 #${detail.value.rank}", modifier = Modifier.weight(1f))
                            MetricTile("赛道评分", detail.value.trackScore?.toInt()?.toString() ?: "--", detail.value.stage, modifier = Modifier.weight(1f))
                        }
                    }
                    item {
                        LiuliCard(Modifier.fillMaxWidth()) {
                            SectionHeader("材料处理")
                            Text("今日 ${detail.value.todayMaterialCount} 条 · 已确认 ${detail.value.confirmedMaterialCount} 条 · 待处理 ${detail.value.pendingMaterialCount} 条", modifier = Modifier.padding(top = 8.dp))
                            Text("24h 排名变化 ${detail.value.rankChange24h ?: 0}，7d 变化 ${detail.value.rankChange7d ?: 0}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                is DashboardDetail.Stock -> {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile("综合评分", detail.value.totalScore?.toString() ?: "--", "排名 #${detail.value.rank}", modifier = Modifier.weight(1f))
                            MetricTile("投资级别", detail.value.investmentLevel ?: "--", detail.value.stockCode, modifier = Modifier.weight(1f))
                        }
                    }
                    item {
                        LiuliCard(Modifier.fillMaxWidth()) {
                            SectionHeader("研究摘要")
                            Text("该标的已进入评分排行。移动端展示核心判断，完整财务、估值和材料请在 Web 端维护。", modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                is DashboardDetail.Portfolio -> {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile("总资产", formatMoney(detail.value.summary.totalValue), formatSignedPercent(detail.value.summary.dayPct), modifier = Modifier.weight(1f))
                            MetricTile("年度盈亏", formatMoney(detail.value.summary.yearPnl), "${detail.value.summary.positionCount} 个持仓", modifier = Modifier.weight(1f))
                        }
                    }
                    items(detail.value.allocationRows.filter { it.type != "total" }.take(10)) {
                        RankingRow(0, it.label, it.stockCode.orEmpty(), formatMoney(it.marketValue), null)
                    }
                }
            }
            item {
                androidx.compose.material3.Button(
                    onClick = { onWriteNote(module, id, "$title：研究记录") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Outlined.EditNote, null)
                    Text("关联知识笔记", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun NewsRow(item: SourceItemDto) = SimpleContentRow(item.title, "${item.sourceName} · ${item.publishTime?.take(16)?.replace('T', ' ').orEmpty()}")

@Composable
private fun ReportRow(item: ReportDto) = SimpleContentRow(item.title, item.summary ?: "${item.sourceModule} · ${item.status}")

@Composable
private fun SimpleContentRow(title: String, subtitle: String) {
    LiuliCard(Modifier.fillMaxWidth().clickable { }) {
        Text(title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun HeatBar(name: String, heat: Float) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(name, modifier = Modifier.width(70.dp), style = MaterialTheme.typography.bodySmall)
        Box(Modifier.weight(1f).height(8.dp).background(LocalLiuliColors.current.canvasInset)) {
            Box(Modifier.fillMaxWidth(heat).height(8.dp).background(MaterialTheme.colorScheme.primary))
        }
        Text("${(heat * 100).toInt()}", modifier = Modifier.width(34.dp), style = MaterialTheme.typography.labelSmall)
    }
}
