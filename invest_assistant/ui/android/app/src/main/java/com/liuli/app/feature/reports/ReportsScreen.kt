package com.liuli.app.feature.reports

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.liuli.app.core.common.reportKindLabel
import com.liuli.app.core.common.toUiMessage
import com.liuli.app.core.design.EmptyPane
import com.liuli.app.core.design.ErrorPane
import com.liuli.app.core.design.LiuliAppBar
import com.liuli.app.core.design.LiuliCard
import com.liuli.app.core.design.LiuliListCard
import com.liuli.app.core.design.LiuliListRow
import com.liuli.app.core.design.LoadingPane
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.design.StatusPill
import com.liuli.app.core.network.ApiService
import com.liuli.app.core.network.ReportDto
import com.mikepenz.markdown.m3.Markdown
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ReportsScreen(
    api: ApiService,
    initialKind: String?,
    onBack: () -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    var kind by remember(initialKind) { mutableStateOf(initialKind) }
    var refresh by remember { mutableIntStateOf(0) }
    var result by remember { mutableStateOf<Result<List<ReportDto>>?>(null) }
    var selected by remember { mutableStateOf<ReportDto?>(null) }

    if (selected != null) {
        ReportReader(api, selected!!, { selected = null }, onWriteNote)
        return
    }

    LaunchedEffect(api, kind, refresh) {
        result = null
        result = runCatching { api.reportsData(reportKind = kind).items }
    }

    Column(Modifier.fillMaxSize()) {
        LiuliAppBar(
            title = "报告库",
            subtitle = "二级研究入口",
            onBack = onBack,
            actions = {
                IconButton(onClick = { refresh++ }) { Icon(Icons.Outlined.Refresh, contentDescription = "刷新") }
            },
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            listOf(null, "market", "track", "stock").forEach { value ->
                FilterChip(selected = kind == value, onClick = { kind = value }, label = { Text(reportKindLabel(value)) })
            }
        }
        when (val current = result) {
            null -> LoadingPane("正在读取报告库…")
            else -> current.fold(
                onSuccess = { reports ->
                    if (reports.isEmpty()) EmptyPane("暂无报告", "当前分类没有可阅读的报告。")
                    else LazyColumn(
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    ) {
                        item {
                            LiuliListCard(Modifier.fillMaxWidth()) {
                                reports.forEachIndexed { index, report ->
                                    LiuliListRow(
                                        title = report.title,
                                        subtitle = "${report.summary ?: "暂无摘要"}\n${report.sourceModule} · ${(report.publishTime ?: report.createdAt)?.take(10).orEmpty()}",
                                        trailing = { StatusPill(reportKindLabel(kind ?: report.targetType)) },
                                        onClick = { selected = report },
                                        showDivider = index != reports.lastIndex,
                                    )
                                }
                            }
                        }
                    }
                },
                onFailure = { ErrorPane(it.toUiMessage("报告加载失败")) { refresh++ } },
            )
        }
    }
}

@Composable
private fun ReportReader(
    api: ApiService,
    report: ReportDto,
    onBack: () -> Unit,
    onWriteNote: (String, Long?, String) -> Unit,
) {
    var content by remember(report.id) { mutableStateOf<Result<String>?>(null) }
    var openError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(api, report.id) {
        content = runCatching { api.reportContent(report.id).use { it.string() } }
    }
    Column(Modifier.fillMaxSize()) {
        LiuliAppBar(
            title = "报告阅读",
            subtitle = "${report.sourceModule} · ${(report.publishTime ?: report.createdAt)?.take(10).orEmpty()}",
            onBack = onBack,
            actions = {
                IconButton(
                    enabled = content?.isSuccess == true,
                    onClick = {
                        val markdown = content?.getOrNull() ?: return@IconButton
                        scope.launch {
                            runCatching {
                                val file = withContext(Dispatchers.IO) {
                                    File(context.cacheDir, "reports").apply { mkdirs() }
                                        .resolve("liuli-report-${report.id}.md")
                                        .apply { writeText(markdown) }
                                }
                                val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW).apply {
                                        setDataAndType(uri, "text/markdown")
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    },
                                )
                            }.onFailure { openError = "未找到可打开 Markdown 的应用" }
                        }
                    },
                ) { Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = "用其他应用打开") }
            },
        )
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(report.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                report.summary?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp)) }
            }
            if (!openError.isNullOrBlank()) item { Text(openError!!, color = MaterialTheme.colorScheme.error) }
            when (val current = content) {
                null -> item { LoadingPane("正在读取报告正文…") }
                else -> current.fold(
                    onSuccess = { markdown ->
                        item {
                            LiuliCard(Modifier.fillMaxWidth()) {
                                Markdown(markdown.ifBlank { "报告正文为空" })
                            }
                        }
                    },
                    onFailure = { item { ErrorPane(it.toUiMessage("报告正文加载失败")) } },
                )
            }
            item {
                Button(
                    onClick = { onWriteNote("report_library", report.id, "报告记录：${report.title}") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Outlined.EditNote, null)
                    Text("基于报告写笔记", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}
