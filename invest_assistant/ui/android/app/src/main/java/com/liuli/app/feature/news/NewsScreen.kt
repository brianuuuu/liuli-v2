package com.liuli.app.feature.news

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liuli.app.core.common.dateBucket
import com.liuli.app.core.common.timeLabel
import com.liuli.app.core.common.toUiMessage
import com.liuli.app.core.design.EmptyPane
import com.liuli.app.core.design.ErrorPane
import com.liuli.app.core.design.LoadingPane
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.network.ApiService
import com.liuli.app.core.network.SourceItemDto
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val NEWS_PAGE_SIZE = 20

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NewsScreen(
    api: ApiService,
    onWriteNote: (String, Long?, String) -> Unit,
    onDetailVisibilityChange: (Boolean) -> Unit = {},
) {
    var queryInput by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var searchMode by remember { mutableStateOf(false) }
    var importantOnly by remember { mutableStateOf(false) }
    var refresh by remember { mutableIntStateOf(0) }
    var entries by remember { mutableStateOf<List<SourceItemDto>>(emptyList()) }
    var total by remember { mutableIntStateOf(0) }
    var initialLoading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<Throwable?>(null) }
    var selected by remember { mutableStateOf<SourceItemDto?>(null) }
    val scope = rememberCoroutineScope()

    selected?.let { item ->
        BackHandler {
            selected = null
            onDetailVisibilityChange(false)
        }
        NewsDetail(
            item = item,
            onBack = {
                selected = null
                onDetailVisibilityChange(false)
            },
            onWriteNote = { module, id, text ->
                onDetailVisibilityChange(false)
                onWriteNote(module, id, text)
            },
        )
        return
    }

    LaunchedEffect(queryInput) {
        delay(350)
        query = queryInput.trim()
    }
    // 请求副作用只跟随筛选条件变化，避免 Retrofit 代理重组后触发重复加载。
    LaunchedEffect(query, importantOnly, refresh) {
        initialLoading = entries.isEmpty()
        refreshing = entries.isNotEmpty()
        error = null
        runCatching {
            api.newsData(
                limit = NEWS_PAGE_SIZE,
                query = query.ifBlank { null },
                importantOnly = importantOnly,
            )
        }.onSuccess { page ->
            entries = page.items
            total = page.total
        }.onFailure {
            error = it
        }
        initialLoading = false
        refreshing = false
    }

    val loadMore = {
        if (!loadingMore && entries.isNotEmpty() && entries.size < total) {
            loadingMore = true
            val expectedQuery = query
            val expectedImportant = importantOnly
            val offset = entries.size
            scope.launch {
                runCatching {
                    api.newsData(
                        limit = NEWS_PAGE_SIZE,
                        offset = offset,
                        query = expectedQuery.ifBlank { null },
                        importantOnly = expectedImportant,
                    )
                }.onSuccess { page ->
                    if (expectedQuery == query && expectedImportant == importantOnly) {
                        entries = (entries + page.items).distinctBy { it.id }
                        total = page.total
                    }
                }.onFailure {
                    if (expectedQuery == query && expectedImportant == importantOnly) error = it
                }
                loadingMore = false
            }
        }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
        NewsControls(
            searchMode = searchMode,
            query = queryInput,
            importantOnly = importantOnly,
            refreshing = refreshing,
            onSearchModeChange = {
                searchMode = it
                if (!it) queryInput = ""
            },
            onQueryChange = { queryInput = it },
            onImportantChange = { importantOnly = it },
            onRefresh = { refresh++ },
        )
        when {
            initialLoading -> LoadingPane("正在同步信息流…")
            entries.isEmpty() && error != null -> {
                ErrorPane(error!!.toUiMessage("新闻加载失败")) { refresh++ }
            }
            entries.isEmpty() -> EmptyPane("暂无新闻", "当前筛选条件下没有信息。")
            else -> {
                val groups = entries.groupBy { dateBucket(it.publishTime ?: it.createdAt) }
                val loadMoreTriggerId = entries.getOrNull(maxOf(0, entries.lastIndex - 3))?.id
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 18.dp),
                ) {
                    groups.forEach { (date, dateItems) ->
                        stickyHeader(key = "date-$date") {
                            NewsDateHeader(date)
                        }
                        items(dateItems, key = { it.id }) { item ->
                            TimelineRow(
                                item = item,
                                onClick = {
                                    selected = item
                                    onDetailVisibilityChange(true)
                                },
                                onWriteNote = onWriteNote,
                            )
                            if (item.id == loadMoreTriggerId) {
                                LaunchedEffect(entries.size, total) { loadMore() }
                            }
                        }
                    }
                    if (loadingMore) {
                        item("loading-more") {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(18.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                            }
                        }
                    } else if (error != null && entries.isNotEmpty()) {
                        item("load-error") {
                            Text(
                                "继续加载失败，点击重试",
                                modifier = Modifier.fillMaxWidth().clickable { loadMore() }.padding(18.dp),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NewsControls(
    searchMode: Boolean,
    query: String,
    importantOnly: Boolean,
    refreshing: Boolean,
    onSearchModeChange: (Boolean) -> Unit,
    onQueryChange: (String) -> Unit,
    onImportantChange: (Boolean) -> Unit,
    onRefresh: () -> Unit,
) {
    val colors = LocalLiuliColors.current
    Row(
        modifier = Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (searchMode) {
            IconButton(onClick = { onSearchModeChange(false) }) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "关闭搜索")
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.fgDefault, fontSize = 16.sp),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    Box {
                        if (query.isBlank()) Text("搜索标题或正文", color = colors.fgMuted, fontSize = 16.sp)
                        inner()
                    }
                },
            )
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Outlined.Close, contentDescription = "清空搜索")
                }
            }
        } else {
            Text(
                "只看重要",
                color = if (importantOnly) MaterialTheme.colorScheme.primary else colors.fgMuted,
                fontSize = 14.sp,
                modifier = Modifier.padding(start = 8.dp),
            )
            Switch(checked = importantOnly, onCheckedChange = onImportantChange, modifier = Modifier.padding(start = 6.dp))
            Spacer(Modifier.weight(1f))
            if (refreshing) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(6.dp))
            }
            IconButton(onClick = { onSearchModeChange(true) }) {
                Icon(Icons.Outlined.Search, contentDescription = "搜索新闻")
            }
            IconButton(onClick = onRefresh) {
                Icon(Icons.Outlined.Refresh, contentDescription = "刷新")
            }
        }
    }
    HorizontalDivider(color = colors.borderMuted)
}

@Composable
private fun NewsDateHeader(date: String) {
    val colors = LocalLiuliColors.current
    val parts = date.split("-")
    val month = parts.getOrNull(1) ?: "--"
    val day = parts.getOrNull(2) ?: "--"
    Row(
        modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier.size(width = 42.dp, height = 44.dp),
            color = MaterialTheme.colorScheme.primaryContainer,
            shape = RoundedCornerShape(8.dp),
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("${month}月", color = MaterialTheme.colorScheme.primary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text(day, color = MaterialTheme.colorScheme.primary, fontSize = 19.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(
            if (date == "日期未知") date else date.replace("-", "."),
            modifier = Modifier.padding(start = 12.dp),
            color = colors.fgMuted,
            fontSize = 17.sp,
        )
    }
    HorizontalDivider(color = colors.borderMuted)
}

@Composable
private fun TimelineRow(
    item: SourceItemDto,
    onClick: () -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    val colors = LocalLiuliColors.current
    val context = LocalContext.current
    val time = timeLabel(item.publishTime ?: item.createdAt)
    val important = isImportant(item)
    val lineColor = colors.borderDefault
    val nodeColor = if (important) MaterialTheme.colorScheme.primary else colors.fgMuted
    val surfaceColor = MaterialTheme.colorScheme.surface
    Row(
        modifier = Modifier.fillMaxWidth()
            .drawBehind {
                val x = 69.dp.toPx()
                drawLine(
                    color = lineColor,
                    start = androidx.compose.ui.geometry.Offset(x, 0f),
                    end = androidx.compose.ui.geometry.Offset(x, size.height),
                    strokeWidth = 1.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 7f)),
                )
                drawCircle(
                    color = surfaceColor,
                    radius = 5.dp.toPx(),
                    center = androidx.compose.ui.geometry.Offset(x, 19.dp.toPx()),
                )
                drawCircle(
                    color = nodeColor,
                    radius = 4.dp.toPx(),
                    center = androidx.compose.ui.geometry.Offset(x, 19.dp.toPx()),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.3.dp.toPx()),
                )
            }
            .clickable(onClick = onClick)
            .padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 16.dp),
    ) {
        Text(
            time,
            modifier = Modifier.width(47.dp).padding(top = 1.dp),
            color = colors.fgMuted,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.width(22.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    item.sourceName,
                    color = colors.fgMuted,
                    fontSize = 12.5.sp,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (important) {
                    TimelinePill("重要")
                }
            }
            Text(
                item.title,
                modifier = Modifier.padding(top = 6.dp),
                color = colors.fgDefault,
                fontSize = 17.sp,
                lineHeight = 25.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.content.isNotBlank() && item.content.trim() != item.title.trim()) {
                Text(
                    item.content,
                    modifier = Modifier.padding(top = 5.dp),
                    color = colors.fgDefault,
                    fontSize = 16.sp,
                    lineHeight = 25.sp,
                    maxLines = 5,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (item.sourceTags.isNotEmpty()) {
                Row(
                    modifier = Modifier.padding(top = 9.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    item.sourceTags.take(3).forEach { relation ->
                        TimelinePill("#${relation.tag?.name ?: relation.triggerText ?: "标签"}")
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 5.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                IconButton(
                    onClick = { onWriteNote("market_radar", item.id, "新闻记录：${item.title}") },
                    modifier = Modifier.size(42.dp),
                ) {
                    Icon(Icons.Outlined.EditNote, contentDescription = "写笔记", tint = colors.fgMuted, modifier = Modifier.size(21.dp))
                }
                IconButton(
                    onClick = { shareNews(context, item) },
                    modifier = Modifier.size(42.dp),
                ) {
                    Icon(Icons.Outlined.Share, contentDescription = "分享", tint = colors.fgMuted, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

@Composable
private fun TimelinePill(text: String) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(6.dp)) {
        Text(
            text,
            color = MaterialTheme.colorScheme.primary,
            fontSize = 12.5.sp,
            lineHeight = 17.sp,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun NewsDetail(
    item: SourceItemDto,
    onBack: () -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    val colors = LocalLiuliColors.current
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
        Row(
            modifier = Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { shareNews(context, item) }) {
                Icon(Icons.Outlined.Share, contentDescription = "分享")
            }
        }
        HorizontalDivider(color = colors.borderMuted)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 26.dp),
        ) {
            item("meta") {
                Text(
                    "${item.sourceName}  ·  ${dateBucket(item.publishTime ?: item.createdAt).replace("-", ".")} ${timeLabel(item.publishTime ?: item.createdAt)}",
                    color = colors.fgMuted,
                    fontSize = 13.5.sp,
                )
                Text(
                    item.title,
                    modifier = Modifier.padding(top = 12.dp),
                    color = colors.fgDefault,
                    fontSize = 23.sp,
                    lineHeight = 33.sp,
                    fontWeight = FontWeight.Bold,
                )
                if (item.sourceTags.isNotEmpty()) {
                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        item.sourceTags.take(4).forEach { TimelinePill("#${it.tag?.name ?: it.triggerText ?: "标签"}") }
                    }
                }
                HorizontalDivider(modifier = Modifier.padding(top = 18.dp), color = colors.borderMuted)
            }
            item("content") {
                Text(
                    item.content.ifBlank { "暂无正文" },
                    modifier = Modifier.padding(top = 18.dp),
                    color = colors.fgDefault,
                    fontSize = 18.sp,
                    lineHeight = 30.sp,
                )
                item.relatedType?.let {
                    Text(
                        "关联 $it #${item.relatedId ?: "--"}",
                        modifier = Modifier.padding(top = 18.dp),
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 13.5.sp,
                    )
                }
                Button(
                    onClick = { onWriteNote("market_radar", item.id, "新闻记录：${item.title}") },
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp).height(48.dp),
                ) {
                    Icon(Icons.Outlined.EditNote, contentDescription = null)
                    Text("基于新闻写笔记", modifier = Modifier.padding(start = 8.dp), fontSize = 15.sp)
                }
            }
        }
    }
}

private fun isImportant(item: SourceItemDto): Boolean =
    item.sourceTags.any {
        val label = it.tag?.name ?: it.triggerText.orEmpty()
        label.contains("重要") || label.contains("核心")
    }

private fun shareNews(context: android.content.Context, item: SourceItemDto) {
    val text = buildString {
        append(item.title)
        if (item.sourceUrl?.isNotBlank() == true) append("\n").append(item.sourceUrl)
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "分享新闻"))
}
