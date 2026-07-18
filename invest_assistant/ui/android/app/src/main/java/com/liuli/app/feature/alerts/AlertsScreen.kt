package com.liuli.app.feature.alerts

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.liuli.app.core.common.alertStatusLabel
import com.liuli.app.core.design.EmptyPane
import com.liuli.app.core.design.ErrorPane
import com.liuli.app.core.design.LiuliAppBar
import com.liuli.app.core.design.LiuliCard
import com.liuli.app.core.design.LiuliListCard
import com.liuli.app.core.design.LiuliListRow
import com.liuli.app.core.design.LoadingPane
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.design.StatusPill
import com.liuli.app.core.common.toUiMessage
import com.liuli.app.core.network.AlertEventDto
import com.liuli.app.core.network.ApiService
import kotlinx.coroutines.launch

@Composable
fun AlertsScreen(api: ApiService, onWriteNote: (String, Long?, String) -> Unit) {
    var filter by remember { mutableStateOf("全部") }
    var refresh by remember { mutableIntStateOf(0) }
    var result by remember { mutableStateOf<Result<List<AlertEventDto>>?>(null) }
    var selected by remember { mutableStateOf<AlertEventDto?>(null) }

    if (selected != null) {
        AlertDetail(api, selected!!, { selected = null; refresh++ }, onWriteNote)
        return
    }

    LaunchedEffect(api, refresh) {
        result = null
        result = runCatching { api.alertsData().items }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            listOf("全部", "未读", "已处理").forEach { option ->
                FilterChip(selected = filter == option, onClick = { filter = option }, label = { Text(option) })
            }
            IconButton(onClick = { refresh++ }) { Icon(Icons.Outlined.Refresh, contentDescription = "刷新") }
        }
        when (val current = result) {
            null -> LoadingPane("正在读取预警…")
            else -> current.fold(
                onSuccess = { all ->
                    val events = all.filter {
                        filter == "全部" || (filter == "未读" && it.status == "unread") ||
                            (filter == "已处理" && it.status == "handled")
                    }
                    if (events.isEmpty()) EmptyPane("暂无预警", "当前状态下没有需要处理的事件。")
                    else LazyColumn(
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    ) {
                        item {
                            LiuliListCard(Modifier.fillMaxWidth()) {
                                events.forEachIndexed { index, event ->
                                    AlertListRow(
                                        event = event,
                                        onClick = { selected = event },
                                        showDivider = index != events.lastIndex,
                                    )
                                }
                            }
                        }
                    }
                },
                onFailure = { ErrorPane(it.toUiMessage("预警加载失败")) { refresh++ } },
            )
        }
    }
}

@Composable
private fun AlertListRow(event: AlertEventDto, onClick: () -> Unit, showDivider: Boolean) {
    val colors = levelColors(event.eventLevel)
    LiuliListRow(
        title = event.title,
        subtitle = "${levelLabel(event.eventLevel)} · ${event.eventTime?.take(16)?.replace('T', ' ').orEmpty()}\n${event.message}",
        leading = {
            androidx.compose.foundation.layout.Box(
                Modifier.size(28.dp).background(colors.second, androidx.compose.foundation.shape.RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(levelLabel(event.eventLevel).take(1), color = colors.first, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.ExtraBold)
            }
        },
        trailing = { StatusPill(alertStatusLabel(event.status), colors.first, colors.second) },
        onClick = onClick,
        showDivider = showDivider,
    )
}

@Composable
private fun AlertDetail(
    api: ApiService,
    initial: AlertEventDto,
    onBack: () -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    var event by remember(initial.id) { mutableStateOf(initial) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val colors = levelColors(event.eventLevel)
    Column(Modifier.fillMaxSize()) {
        LiuliAppBar("预警详情", event.eventTime?.take(16)?.replace('T', ' '), onBack = onBack)
        LazyColumn(
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                LiuliCard(Modifier.fillMaxWidth()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusPill(levelLabel(event.eventLevel), colors.first, colors.second)
                        StatusPill(alertStatusLabel(event.status))
                    }
                    Text(event.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
                    Text(event.message, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 10.dp))
                    Text("规则 #${event.ruleId ?: "--"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
                }
            }
            if (!error.isNullOrBlank()) item { Text(error!!, color = MaterialTheme.colorScheme.error) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        enabled = !busy && event.status == "unread",
                        onClick = {
                            scope.launch {
                                busy = true
                                runCatching { api.markAlertRead(event.id) }
                                    .onSuccess { event = event.copy(status = "read"); error = null }
                                    .onFailure { error = it.toUiMessage("标记已读失败") }
                                busy = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("标记已读") }
                    Button(
                        enabled = !busy && event.status != "handled",
                        onClick = {
                            scope.launch {
                                busy = true
                                runCatching { api.handleAlert(event.id) }
                                    .onSuccess { event = event.copy(status = "handled"); error = null }
                                    .onFailure { error = it.toUiMessage("处理结果未知，请刷新确认") }
                                busy = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.CheckCircle, null)
                        Text("已处理")
                    }
                }
            }
            item {
                OutlinedButton(
                    onClick = { onWriteNote("alert_center", event.id, "预警记录：${event.title}") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Outlined.EditNote, null)
                    Text("关联知识笔记", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

private fun levelLabel(level: String): String = when (level) {
    "high", "critical" -> "高优先级"
    "warning", "medium" -> "中优先级"
    else -> "普通"
}

@Composable
private fun levelColors(level: String): Pair<Color, Color> = when (level) {
    "high", "critical" -> LocalLiuliColors.current.danger to LocalLiuliColors.current.dangerMuted
    "warning", "medium" -> LocalLiuliColors.current.attention to LocalLiuliColors.current.attentionMuted
    else -> LocalLiuliColors.current.accent to LocalLiuliColors.current.accentMuted
}
