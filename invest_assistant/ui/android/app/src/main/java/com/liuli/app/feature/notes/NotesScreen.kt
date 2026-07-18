package com.liuli.app.feature.notes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.liuli.app.core.database.NoteDraftDao
import com.liuli.app.core.database.NoteDraftEntity
import com.liuli.app.core.common.toUiMessage
import com.liuli.app.core.design.EmptyPane
import com.liuli.app.core.design.ErrorPane
import com.liuli.app.core.design.LiuliAppBar
import com.liuli.app.core.design.LiuliCard
import com.liuli.app.core.design.LiuliListCard
import com.liuli.app.core.design.LiuliListRow
import com.liuli.app.core.design.LoadingPane
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.design.SectionHeader
import com.liuli.app.core.design.StatusPill
import com.liuli.app.core.network.ApiService
import com.liuli.app.core.network.KnowledgeNoteDto
import com.liuli.app.core.network.NoteCreateRequest
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun NotesScreen(api: ApiService, draftDao: NoteDraftDao) {
    val drafts by draftDao.observeAll().collectAsState(initial = emptyList())
    var editingId by remember { mutableStateOf<String?>(null) }
    var selectedRemote by remember { mutableStateOf<KnowledgeNoteDto?>(null) }

    when {
        editingId != null -> NoteEditor(
            initial = drafts.firstOrNull { it.localId == editingId } ?: NoteDraftEntity(
                localId = editingId!!,
                serverNoteId = null,
                title = "",
                content = "",
                updatedAtEpochMillis = System.currentTimeMillis(),
            ),
            api = api,
            draftDao = draftDao,
            onClose = { editingId = null },
        )
        selectedRemote != null -> NoteReader(selectedRemote!!, onBack = { selectedRemote = null })
        else -> NotesList(
            api = api,
            drafts = drafts,
            onNew = { editingId = UUID.randomUUID().toString() },
            onOpenDraft = { editingId = it.localId },
            onOpenRemote = { selectedRemote = it },
        )
    }
}

@Composable
private fun NotesList(
    api: ApiService,
    drafts: List<NoteDraftEntity>,
    onNew: () -> Unit,
    onOpenDraft: (NoteDraftEntity) -> Unit,
    onOpenRemote: (KnowledgeNoteDto) -> Unit,
) {
    var queryInput by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("全部") }
    var refresh by remember { mutableIntStateOf(0) }
    var result by remember { mutableStateOf<Result<List<KnowledgeNoteDto>>?>(null) }
    LaunchedEffect(api, query, refresh) {
        result = null
        result = runCatching {
            api.notesData(limit = 50, query = query.ifBlank { null }).items
        }
    }

    Scaffold(
        containerColor = LocalLiuliColors.current.canvasSubtle,
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNew,
                modifier = Modifier.size(48.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Icon(Icons.Outlined.Add, contentDescription = "新增笔记")
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                OutlinedTextField(
                    value = queryInput,
                    onValueChange = { queryInput = it },
                    placeholder = { Text("搜索标题或正文") },
                    leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    trailingIcon = {
                        IconButton(onClick = { query = queryInput.trim() }) {
                            Icon(Icons.Outlined.Search, contentDescription = "搜索")
                        }
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().height(44.dp),
                )
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("全部", "论点", "复盘").forEach { option ->
                        FilterChip(selected = type == option, onClick = { type = option }, label = { Text(option) })
                    }
                }
            }
            if (drafts.isNotEmpty()) {
                item { SectionHeader("本地草稿", "${drafts.size} 条", onAction = {}) }
                item {
                    LiuliListCard(Modifier.fillMaxWidth()) {
                        drafts.forEachIndexed { index, draft ->
                            val failed = draft.saveState == "submit_failed"
                            LiuliListRow(
                                title = draft.title.ifBlank { "未命名草稿" },
                                subtitle = draft.content.ifBlank { "等待输入正文…" }.replace("\n", " "),
                                trailing = {
                                    Icon(
                                        if (failed) Icons.Outlined.CloudOff else Icons.Outlined.CloudDone,
                                        contentDescription = null,
                                        tint = if (failed) MaterialTheme.colorScheme.error else LocalLiuliColors.current.success,
                                    )
                                },
                                onClick = { onOpenDraft(draft) },
                                showDivider = index != drafts.lastIndex,
                            )
                        }
                    }
                }
            }
            item { SectionHeader("知识笔记") }
            when (val current = result) {
                null -> item { LoadingPane("正在读取知识笔记…") }
                else -> current.fold(
                    onSuccess = { notes ->
                        val filtered = notes.filter {
                            type == "全部" || (type == "论点" && it.noteType in listOf("thesis", "research")) ||
                                (type == "复盘" && it.noteType in listOf("review", "portfolio"))
                        }
                        if (filtered.isEmpty()) item { EmptyPane("暂无笔记", "新增一条记录，沉淀当前判断。") }
                        else item {
                            LiuliListCard(Modifier.fillMaxWidth()) {
                                filtered.forEachIndexed { index, note ->
                                    LiuliListRow(
                                        title = note.title,
                                        subtitle = "${note.content.replace("\n", " ")}\n${listOfNotNull(note.relatedModule, note.updatedAt?.take(10)).joinToString(" · ")}",
                                        trailing = { StatusPill(note.noteType.ifBlank { "笔记" }) },
                                        onClick = { onOpenRemote(note) },
                                        showDivider = index != filtered.lastIndex,
                                    )
                                }
                            }
                        }
                    },
                    onFailure = { error -> item { ErrorPane(error.toUiMessage("笔记加载失败")) { refresh++ } } },
                )
            }
        }
    }
}

@Composable
private fun NoteReader(note: KnowledgeNoteDto, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        LiuliAppBar("知识笔记", note.updatedAt?.take(16)?.replace('T', ' '), onBack = onBack)
        LazyColumn(
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(note.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusPill(note.noteType.ifBlank { "笔记" })
                    note.relatedModule?.let { StatusPill(it) }
                }
            }
            item {
                LiuliCard(Modifier.fillMaxWidth()) {
                    Text(
                        note.content,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
        }
    }
}

@Composable
private fun NoteEditor(
    initial: NoteDraftEntity,
    api: ApiService,
    draftDao: NoteDraftDao,
    onClose: () -> Unit,
) {
    var title by remember(initial.localId) { mutableStateOf(initial.title) }
    var content by remember(initial.localId) { mutableStateOf(initial.content) }
    var submitting by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(initial.errorMessage) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(title, content) {
        delay(800)
        draftDao.upsert(NoteDraftEntity.fromDomain(initial.toDomain().withContent(title, content, System.currentTimeMillis()), initial))
        message = "已自动保存到本地"
    }

    Column(Modifier.fillMaxSize()) {
        LiuliAppBar(
            title = "编辑笔记",
            subtitle = message,
            onBack = onClose,
            actions = {
                Button(
                    enabled = content.isNotBlank() && !submitting,
                    onClick = {
                        scope.launch {
                            submitting = true
                            runCatching {
                                api.createNote(
                                    NoteCreateRequest(
                                        title = title.ifBlank { null },
                                        content = content,
                                        noteType = initial.noteType,
                                        relatedModule = initial.relatedModule,
                                        relatedId = initial.relatedId,
                                    ),
                                )
                            }.onSuccess {
                                draftDao.deleteById(initial.localId)
                                onClose()
                            }.onFailure {
                                val failed = initial.toDomain().withContent(title, content, System.currentTimeMillis())
                                    .markSubmitFailed(it.toUiMessage("提交失败"), System.currentTimeMillis())
                                draftDao.upsert(NoteDraftEntity.fromDomain(failed, initial))
                                message = failed.errorMessage
                            }
                            submitting = false
                        }
                    },
                ) { Text(if (submitting) "提交中" else "提交") }
            },
        )
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                placeholder = { Text("笔记标题") },
                textStyle = MaterialTheme.typography.titleMedium,
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = content,
                onValueChange = { content = it },
                placeholder = { Text("简要记录论点、证据与风险…") },
                minLines = 16,
                modifier = Modifier.fillMaxWidth().weight(1f).padding(top = 10.dp),
            )
        }
    }
}
