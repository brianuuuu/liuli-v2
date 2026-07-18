package com.liuli.app.feature.news

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.liuli.app.core.common.dateBucket
import com.liuli.app.core.common.timeLabel
import com.liuli.app.core.design.EmptyPane
import com.liuli.app.core.design.ErrorPane
import com.liuli.app.core.design.LiuliAppBar
import com.liuli.app.core.design.LiuliCard
import com.liuli.app.core.design.LoadingPane
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.design.StatusPill
import com.liuli.app.core.common.toUiMessage
import com.liuli.app.core.network.ApiService
import com.liuli.app.core.network.SourceItemDto

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NewsScreen(api: ApiService, onWriteNote: (String, Long?, String) -> Unit) {
    var queryInput by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var importantOnly by remember { mutableStateOf(false) }
    var refresh by remember { mutableIntStateOf(0) }
    var result by remember { mutableStateOf<Result<List<SourceItemDto>>?>(null) }
    var selected by remember { mutableStateOf<SourceItemDto?>(null) }

    if (selected != null) {
        NewsDetail(selected!!, { selected = null }, onWriteNote)
        return
    }

    LaunchedEffect(api, query, importantOnly, refresh) {
        result = null
        result = runCatching {
            api.newsData(query = query.ifBlank { null }, importantOnly = importantOnly).items
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = queryInput,
                onValueChange = { queryInput = it },
                placeholder = { Text("搜索新闻") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                singleLine = true,
                modifier = Modifier.weight(1f).height(44.dp),
            )
            IconButton(onClick = { refresh++ }, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Outlined.Refresh, contentDescription = "刷新", modifier = Modifier.size(19.dp))
            }
        }
        Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            FilterChip(selected = query.isBlank(), onClick = { query = ""; queryInput = "" }, label = { Text("全部") })
            FilterChip(selected = importantOnly, onClick = { importantOnly = !importantOnly }, label = { Text("重要") })
            FilterChip(selected = query.isNotBlank(), onClick = { query = queryInput.trim() }, label = { Text("搜索") })
        }
        when (val current = result) {
            null -> LoadingPane("正在同步信息流…")
            else -> current.fold(
                onSuccess = { entries ->
                    val groups = entries.groupBy { dateBucket(it.publishTime ?: it.createdAt) }
                    if (entries.isEmpty()) EmptyPane("暂无新闻", "当前筛选条件下没有信息。")
                    else LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 16.dp),
                    ) {
                        groups.forEach { (date, dateItems) ->
                            stickyHeader {
                                Text(
                                    date,
                                    modifier = Modifier.fillMaxWidth().background(LocalLiuliColors.current.canvasSubtle)
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            items(dateItems, key = { it.id }) { item ->
                                TimelineRow(item) { selected = item }
                            }
                        }
                    }
                },
                onFailure = { ErrorPane(it.toUiMessage("新闻加载失败")) { refresh++ } },
            )
        }
    }
}

@Composable
private fun TimelineRow(item: SourceItemDto, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(27.dp).fillMaxHeight()) {
            Box(
                Modifier.padding(top = 14.dp).size(9.dp).rotate(45f).background(
                    if (item.sourceTags.any { (it.tag?.name ?: it.triggerText).orEmpty().contains("重要") }) {
                        LocalLiuliColors.current.attention
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                    RoundedCornerShape(2.dp),
                ),
            )
            Box(Modifier.width(1.dp).weight(1f).background(LocalLiuliColors.current.borderDefault))
        }
        Column(
            Modifier.weight(1f).clickable(onClick = onClick).padding(top = 7.dp, bottom = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(timeLabel(item.publishTime ?: item.createdAt), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.ExtraBold)
                Text(item.sourceName, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 7.dp))
                if (item.sourceTags.any { (it.tag?.name ?: it.triggerText).orEmpty().contains("重要") }) {
                    StatusPill("重要", LocalLiuliColors.current.danger, LocalLiuliColors.current.dangerMuted)
                }
            }
            Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 5.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (item.sourceTags.isNotEmpty()) {
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    item.sourceTags.take(3).forEach { relation ->
                        StatusPill(relation.tag?.name ?: relation.triggerText ?: "标签")
                    }
                }
            }
            if (item.relatedType != null && item.relatedId != null) {
                Text("关联 ${item.relatedType} #${item.relatedId}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 7.dp))
            }
            androidx.compose.material3.HorizontalDivider(
                modifier = Modifier.padding(top = 10.dp),
                color = LocalLiuliColors.current.borderMuted,
            )
        }
    }
}

@Composable
private fun NewsDetail(
    item: SourceItemDto,
    onBack: () -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        LiuliAppBar("新闻详情", "${item.sourceName} · ${item.publishTime?.take(16)?.replace('T', ' ').orEmpty()}", onBack = onBack)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(item.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    item.sourceTags.take(4).forEach { StatusPill(it.tag?.name ?: it.triggerText ?: "标签") }
                }
            }
            item {
                LiuliCard(Modifier.fillMaxWidth()) {
                    Text(
                        item.content.ifBlank { "暂无正文" },
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
            item {
                Button(
                    onClick = { onWriteNote("market_radar", item.id, "新闻记录：${item.title}") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Outlined.EditNote, null)
                    Text("基于新闻写笔记", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}
