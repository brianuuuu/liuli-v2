package com.liuli.app.feature.notes

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liuli.app.core.common.toUiMessage
import com.liuli.app.core.design.EmptyPane
import com.liuli.app.core.design.ErrorPane
import com.liuli.app.core.design.LoadingPane
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.network.ApiService
import com.liuli.app.core.network.KnowledgeNoteDto
import com.liuli.app.core.network.KnowledgeNoteGroupDto
import com.liuli.app.core.network.NoteCreateRequest
import com.liuli.app.core.network.NoteGroupWriteRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class NoteComposerContext(
    val relatedModule: String? = null,
    val relatedId: Long? = null,
    val initialText: String = "",
    val groupId: Long? = null,
)

@Composable
fun NotesScreen(
    api: ApiService,
    initialComposerContext: NoteComposerContext? = null,
    onComposerContextConsumed: () -> Unit = {},
) {
    var selectedNote by remember { mutableStateOf<KnowledgeNoteDto?>(null) }
    var selectedGroupId by remember { mutableStateOf<Long?>(null) }
    var groupsRefresh by remember { mutableIntStateOf(0) }
    var groups by remember { mutableStateOf<List<KnowledgeNoteGroupDto>>(emptyList()) }
    var groupsLoading by remember { mutableStateOf(true) }
    var notesRefresh by remember { mutableIntStateOf(0) }
    var queryInput by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var searchMode by remember { mutableStateOf(false) }
    var notesResult by remember { mutableStateOf<Result<List<KnowledgeNoteDto>>?>(null) }
    var composerContext by remember { mutableStateOf<NoteComposerContext?>(null) }
    var composerOpen by remember { mutableStateOf(false) }
    var manageGroups by remember { mutableStateOf(false) }

    LaunchedEffect(groupsRefresh) {
        groupsLoading = true
        groups = runCatching { api.noteGroups() }.getOrDefault(emptyList())
        groupsLoading = false
        if (selectedGroupId != null && groups.none { it.id == selectedGroupId }) {
            selectedGroupId = null
        }
    }
    LaunchedEffect(queryInput) {
        delay(350)
        query = queryInput.trim()
    }
    LaunchedEffect(selectedGroupId, query, notesRefresh) {
        notesResult = null
        notesResult = runCatching {
            api.notesData(
                limit = 100,
                query = query.ifBlank { null },
                groupId = selectedGroupId,
            ).items
        }
    }
    LaunchedEffect(initialComposerContext) {
        if (initialComposerContext != null) {
            composerContext = initialComposerContext
            composerOpen = true
            onComposerContextConsumed()
        }
    }

    selectedNote?.let { note ->
        NoteReader(
            api = api,
            note = note,
            groups = groups,
            onBack = { selectedNote = null },
            onUpdated = {
                selectedNote = it
                notesRefresh++
            },
        )
        return
    }

    val selectedGroup = groups.firstOrNull { it.id == selectedGroupId }
    Scaffold(
        containerColor = LocalLiuliColors.current.canvasSubtle,
        floatingActionButtonPosition = androidx.compose.material3.FabPosition.Center,
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    composerContext = NoteComposerContext(groupId = selectedGroupId)
                    composerOpen = true
                },
                modifier = Modifier.size(56.dp),
                shape = RoundedCornerShape(17.dp),
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = Color.White,
            ) {
                Icon(Icons.Outlined.Add, contentDescription = "快速记录", modifier = Modifier.size(30.dp))
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            NotesHeader(
                title = selectedGroup?.name ?: "全部笔记",
                groups = groups,
                groupsLoading = groupsLoading,
                selectedGroupId = selectedGroupId,
                searchMode = searchMode,
                query = queryInput,
                onQueryChange = { queryInput = it },
                onSearchModeChange = {
                    searchMode = it
                    if (!it) queryInput = ""
                },
                onGroupSelected = { selectedGroupId = it },
                onManageGroups = { manageGroups = true },
            )
            when (val current = notesResult) {
                null -> LoadingPane("正在读取记录…")
                else -> current.fold(
                    onSuccess = { notes ->
                        if (notes.isEmpty()) {
                            EmptyPane(
                                title = if (query.isBlank()) "还没有记录" else "没有匹配结果",
                                message = if (query.isBlank()) "点击下方 +，记下现在的想法。" else "换个关键词再试试。",
                            )
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 86.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                items(notes, key = { it.id }) { note ->
                                    MemoCard(note = note, onOpen = { selectedNote = note })
                                }
                            }
                        }
                    },
                    onFailure = {
                        ErrorPane(it.toUiMessage("记录加载失败")) { notesRefresh++ }
                    },
                )
            }
        }
    }

    if (composerOpen) {
        QuickMemoSheet(
            api = api,
            groups = groups,
            initialGroupId = composerContext?.groupId ?: selectedGroupId,
            context = composerContext,
            editingNote = null,
            onDismiss = {
                composerOpen = false
                composerContext = null
            },
            onSaved = {
                composerOpen = false
                composerContext = null
                notesRefresh++
            },
        )
    }

    if (manageGroups) {
        GroupManagerDialog(
            api = api,
            groups = groups,
            onDismiss = { manageGroups = false },
            onChanged = { groupsRefresh++ },
        )
    }
}

@Composable
private fun NotesHeader(
    title: String,
    groups: List<KnowledgeNoteGroupDto>,
    groupsLoading: Boolean,
    selectedGroupId: Long?,
    searchMode: Boolean,
    query: String,
    onQueryChange: (String) -> Unit,
    onSearchModeChange: (Boolean) -> Unit,
    onGroupSelected: (Long?) -> Unit,
    onManageGroups: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val colors = LocalLiuliColors.current
    Row(
        modifier = Modifier.fillMaxWidth().height(58.dp).background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 8.dp),
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
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.fgDefault),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    if (query.isBlank()) {
                        Text("搜索记录", color = colors.fgMuted, style = MaterialTheme.typography.bodyLarge)
                    }
                    inner()
                },
            )
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Outlined.Close, contentDescription = "清空搜索")
                }
            }
        } else {
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(Icons.Outlined.Menu, contentDescription = "切换分组")
                }
                GroupDropdown(
                    expanded = menuOpen,
                    groups = groups,
                    groupsLoading = groupsLoading,
                    selectedGroupId = selectedGroupId,
                    onDismiss = { menuOpen = false },
                    onSelected = {
                        onGroupSelected(it)
                        menuOpen = false
                    },
                    onManage = {
                        menuOpen = false
                        onManageGroups()
                    },
                )
            }
            Row(
                modifier = Modifier.clickable { menuOpen = true }.padding(horizontal = 4.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { onSearchModeChange(true) }) {
                Icon(Icons.Outlined.Search, contentDescription = "搜索记录", modifier = Modifier.size(25.dp))
            }
        }
    }
    HorizontalDivider(color = colors.borderMuted)
}

@Composable
private fun GroupDropdown(
    expanded: Boolean,
    groups: List<KnowledgeNoteGroupDto>,
    groupsLoading: Boolean,
    selectedGroupId: Long?,
    onDismiss: () -> Unit,
    onSelected: (Long?) -> Unit,
    onManage: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text("全部笔记", fontWeight = if (selectedGroupId == null) FontWeight.Bold else FontWeight.Normal) },
            onClick = { onSelected(null) },
        )
        groups.forEach { group ->
            DropdownMenuItem(
                text = { Text(group.name, fontWeight = if (selectedGroupId == group.id) FontWeight.Bold else FontWeight.Normal) },
                onClick = { onSelected(group.id) },
            )
        }
        if (groupsLoading) {
            DropdownMenuItem(text = { Text("正在读取分组…") }, onClick = {}, enabled = false)
        }
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text("编辑分组", color = MaterialTheme.colorScheme.primary) },
            leadingIcon = { Icon(Icons.Outlined.Edit, contentDescription = null) },
            onClick = onManage,
        )
    }
}

@Composable
private fun MemoCard(note: KnowledgeNoteDto, onOpen: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    val colors = LocalLiuliColors.current
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = RoundedCornerShape(13.dp),
        colors = CardDefaults.cardColors(containerColor = colors.canvasInset),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(Modifier.padding(start = 15.dp, top = 12.dp, end = 9.dp, bottom = 15.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatNoteTime(note.createdAt ?: note.updatedAt),
                    modifier = Modifier.weight(1f),
                    color = colors.fgMuted,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.5.sp, lineHeight = 19.sp),
                )
                Box {
                    IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Outlined.MoreHoriz, contentDescription = "更多", tint = colors.fgMuted)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("查看完整记录") },
                            onClick = {
                                menuOpen = false
                                onOpen()
                            },
                        )
                    }
                }
            }
            Text(
                text = note.content.ifBlank { note.title },
                style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.5.sp, lineHeight = 26.sp),
                color = colors.fgDefault,
                modifier = Modifier.padding(start = 1.dp, end = 6.dp, top = 5.dp),
                maxLines = 8,
                overflow = TextOverflow.Ellipsis,
            )
            val tags = note.tags.map { "#${it.name}" }.ifEmpty { parseStoredTags(note.tagsText) }
            if (tags.isNotEmpty() || note.group != null) {
                Row(
                    modifier = Modifier.padding(top = 9.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    note.group?.let { MemoPill(it.name, foreground = colors.fgMuted, background = colors.canvasSubtle) }
                    tags.take(3).forEach { MemoPill(it) }
                }
            }
        }
    }
}

@Composable
private fun MemoPill(
    text: String,
    foreground: Color = MaterialTheme.colorScheme.primary,
    background: Color = MaterialTheme.colorScheme.primaryContainer,
) {
    Surface(color = background, shape = RoundedCornerShape(7.dp)) {
        Text(
            text = text,
            color = foreground,
            fontSize = 13.sp,
            lineHeight = 18.sp,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun NoteReader(
    api: ApiService,
    note: KnowledgeNoteDto,
    groups: List<KnowledgeNoteGroupDto>,
    onBack: () -> Unit,
    onUpdated: (KnowledgeNoteDto) -> Unit,
) {
    val colors = LocalLiuliColors.current
    var editing by remember(note.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(colors.canvasSubtle)) {
        Row(
            modifier = Modifier.fillMaxWidth().height(56.dp).background(MaterialTheme.colorScheme.surface)
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
            }
            Text(
                formatNoteTime(note.createdAt ?: note.updatedAt),
                modifier = Modifier.weight(1f),
                color = colors.fgMuted,
                style = MaterialTheme.typography.bodyMedium,
            )
            IconButton(onClick = { editing = true }) {
                Icon(Icons.Outlined.Edit, contentDescription = "编辑笔记", tint = MaterialTheme.colorScheme.primary)
            }
        }
        HorizontalDivider(color = colors.borderMuted)
        LazyColumn(
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Card(
                    shape = RoundedCornerShape(13.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, colors.borderMuted),
                ) {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text(
                            note.content.ifBlank { note.title },
                            style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp, lineHeight = 28.sp),
                        )
                        val tags = note.tags.map { "#${it.name}" }.ifEmpty { parseStoredTags(note.tagsText) }
                        if (tags.isNotEmpty() || note.group != null) {
                            Row(
                                modifier = Modifier.padding(top = 14.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                note.group?.let { MemoPill(it.name, foreground = colors.fgMuted, background = colors.canvasSubtle) }
                                tags.take(4).forEach { MemoPill(it) }
                            }
                        }
                    }
                }
            }
        }
    }
    if (editing) {
        QuickMemoSheet(
            api = api,
            groups = groups,
            initialGroupId = note.groupId,
            context = null,
            editingNote = note,
            onDismiss = { editing = false },
            onSaved = {
                editing = false
                onUpdated(it)
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickMemoSheet(
    api: ApiService,
    groups: List<KnowledgeNoteGroupDto>,
    initialGroupId: Long?,
    context: NoteComposerContext?,
    editingNote: KnowledgeNoteDto?,
    onDismiss: () -> Unit,
    onSaved: (KnowledgeNoteDto) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var content by remember(context, editingNote) {
        mutableStateOf(editingNote?.content ?: context?.initialText.orEmpty())
    }
    var groupId by remember(context, initialGroupId, editingNote) {
        mutableStateOf(editingNote?.groupId ?: context?.groupId ?: initialGroupId)
    }
    var groupMenuOpen by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val colors = LocalLiuliColors.current

    LaunchedEffect(Unit) {
        delay(220)
        focusRequester.requestFocus()
        keyboard?.show()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = {
            Box(
                Modifier.padding(top = 9.dp, bottom = 4.dp).size(width = 34.dp, height = 4.dp)
                    .background(colors.borderDefault, RoundedCornerShape(2.dp)),
            )
        },
    ) {
        Column(Modifier.fillMaxWidth().imePadding().padding(start = 16.dp, end = 16.dp, bottom = 12.dp)) {
            Box {
                TextButton(onClick = { groupMenuOpen = true }, contentPadding = PaddingValues(horizontal = 0.dp)) {
                    Text(groups.firstOrNull { it.id == groupId }?.name ?: "未分组")
                    Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = null)
                }
                DropdownMenu(expanded = groupMenuOpen, onDismissRequest = { groupMenuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text("未分组") },
                        onClick = {
                            groupId = null
                            groupMenuOpen = false
                        },
                    )
                    groups.forEach { group ->
                        DropdownMenuItem(
                            text = { Text(group.name) },
                            onClick = {
                                groupId = group.id
                                groupMenuOpen = false
                            },
                        )
                    }
                }
            }
            BasicTextField(
                value = content,
                onValueChange = {
                    content = it
                    error = null
                },
                textStyle = MaterialTheme.typography.bodyLarge.copy(
                    color = colors.fgDefault,
                    fontSize = 18.sp,
                    lineHeight = 27.sp,
                ),
                modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 175.dp).focusRequester(focusRequester),
                decorationBox = { inner ->
                    Box(Modifier.fillMaxWidth()) {
                        if (content.isBlank()) {
                            Text(
                                "现在的想法是…",
                                color = colors.fgMuted,
                                style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp),
                            )
                        }
                        inner()
                    }
                },
            )
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            HorizontalDivider(modifier = Modifier.padding(top = 8.dp), color = colors.borderMuted)
            Row(
                modifier = Modifier.fillMaxWidth().height(58.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = { content += if (content.isBlank() || content.endsWith(" ")) "#" else " #" },
                ) {
                    Text("#", fontSize = 27.sp, fontWeight = FontWeight.Normal)
                }
                Text(
                    "短笔记",
                    color = colors.fgMuted,
                    style = MaterialTheme.typography.labelMedium,
                )
                Spacer(Modifier.weight(1f))
                Surface(
                    onClick = {
                        if (content.isBlank() || busy) return@Surface
                        scope.launch {
                            busy = true
                            error = null
                            val request = NoteCreateRequest(
                                content = content.trim(),
                                groupId = groupId,
                                relatedModule = editingNote?.relatedModule ?: context?.relatedModule,
                                relatedId = editingNote?.relatedId ?: context?.relatedId,
                                tags = extractHashtags(content),
                                tagIds = editingNote?.tags?.map { it.id }.orEmpty(),
                                status = editingNote?.status ?: "active",
                            )
                            runCatching {
                                if (editingNote == null) {
                                    api.createNote(request)
                                } else {
                                    api.updateNote(editingNote.id, request)
                                }
                            }.onSuccess { saved ->
                                keyboard?.hide()
                                onSaved(saved)
                            }.onFailure {
                                error = it.toUiMessage(if (editingNote == null) "提交失败" else "保存失败")
                            }
                            busy = false
                        }
                    },
                    enabled = content.isNotBlank() && !busy,
                    modifier = Modifier.size(46.dp),
                    shape = RoundedCornerShape(15.dp),
                    color = if (content.isNotBlank() && !busy) MaterialTheme.colorScheme.primary else colors.canvasInset,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (busy) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(
                                Icons.AutoMirrored.Outlined.Send,
                                contentDescription = "提交",
                                tint = if (content.isNotBlank()) Color.White else colors.fgMuted,
                                modifier = Modifier.size(23.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupManagerDialog(
    api: ApiService,
    groups: List<KnowledgeNoteGroupDto>,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
) {
    var newName by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<KnowledgeNoteGroupDto?>(null) }
    var editName by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("编辑分组") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (groups.isEmpty()) {
                    Text("还没有分组。", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    groups.forEach { group ->
                        Row(
                            modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 44.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(group.name, modifier = Modifier.weight(1f), maxLines = 1)
                            IconButton(
                                onClick = {
                                    editing = group
                                    editName = group.name
                                },
                            ) {
                                Icon(Icons.Outlined.Edit, contentDescription = "重命名 ${group.name}")
                            }
                        }
                    }
                }
                HorizontalDivider()
                OutlinedTextField(
                    value = newName,
                    onValueChange = {
                        newName = it
                        error = null
                    },
                    label = { Text("新分组名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Button(
                    onClick = {
                        scope.launch {
                            busy = true
                            runCatching { api.createNoteGroup(NoteGroupWriteRequest(newName.trim())) }
                                .onSuccess {
                                    newName = ""
                                    onChanged()
                                }
                                .onFailure { error = it.toUiMessage("新建分组失败") }
                            busy = false
                        }
                    },
                    enabled = newName.isNotBlank() && !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (busy) "保存中…" else "新增分组")
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("完成") } },
    )

    editing?.let { group ->
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text("重命名分组") },
            text = {
                OutlinedTextField(
                    value = editName,
                    onValueChange = {
                        editName = it
                        error = null
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    enabled = editName.isNotBlank() && !busy,
                    onClick = {
                        scope.launch {
                            busy = true
                            runCatching {
                                api.updateNoteGroup(
                                    group.id,
                                    NoteGroupWriteRequest(
                                        name = editName.trim(),
                                        sortOrder = group.sortOrder,
                                        status = group.status,
                                    ),
                                )
                            }.onSuccess {
                                editing = null
                                onChanged()
                            }.onFailure { error = it.toUiMessage("修改分组失败") }
                            busy = false
                        }
                    },
                ) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("取消") } },
        )
    }
}

private fun formatNoteTime(value: String?): String =
    value?.take(16)?.replace('T', ' ') ?: "--"

private fun parseStoredTags(value: String?): List<String> =
    value.orEmpty().split(Regex("\\s+")).filter { it.startsWith("#") && it.length > 1 }

internal fun extractHashtags(value: String): String? {
    val tags = Regex("""(?<!\S)#([\p{L}\p{N}_-]+)""")
        .findAll(value)
        .map { "#${it.groupValues[1]}" }
        .distinct()
        .toList()
    return tags.takeIf { it.isNotEmpty() }?.joinToString(" ")
}
