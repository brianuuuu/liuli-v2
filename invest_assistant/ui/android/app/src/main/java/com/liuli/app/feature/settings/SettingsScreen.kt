package com.liuli.app.feature.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.liuli.app.BuildConfig
import com.liuli.app.core.design.LiuliAppBar
import com.liuli.app.core.design.LiuliBrandMark
import com.liuli.app.core.design.LiuliCard
import com.liuli.app.core.design.LiuliListCard
import com.liuli.app.core.design.LiuliListRow
import com.liuli.app.core.design.LocalLiuliColors
import com.liuli.app.core.design.SectionHeader
import com.liuli.app.core.design.ThemeMode
import com.liuli.app.core.network.ApiService
import com.liuli.app.core.network.ChangePasswordRequest
import com.liuli.app.core.network.UserMe
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun SettingsScreen(
    api: ApiService,
    server: String,
    themeMode: ThemeMode,
    draftCount: Int,
    onThemeChange: (ThemeMode) -> Unit,
    onEditServer: () -> Unit,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    showAppBar: Boolean = true,
) {
    var user by remember { mutableStateOf<UserMe?>(null) }
    var passwordDialog by remember { mutableStateOf(false) }
    var cacheFiles by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    fun refreshCacheCount() {
        cacheFiles = context.cacheDir.resolve("reports").listFiles()?.size ?: 0
    }
    LaunchedEffect(api) {
        user = runCatching { api.me() }.getOrNull()
        refreshCacheCount()
    }

    Column(Modifier.fillMaxSize()) {
        if (showAppBar) {
            LiuliAppBar("设置", "个人投资终端", onBack = onBack)
        }
        LazyColumn(
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                LiuliCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.Surface(
                            shape = androidx.compose.foundation.shape.CircleShape,
                            color = LocalLiuliColors.current.fgDefault,
                        ) {
                            androidx.compose.foundation.layout.Box(
                                Modifier.padding(10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("BU", color = LocalLiuliColors.current.canvas, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.ExtraBold)
                            }
                        }
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(user?.displayName ?: user?.username ?: "个人投资者", fontWeight = FontWeight.SemiBold)
                            Text("${user?.username ?: "admin"} · 专业投资 + IT 极客", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            item { SectionHeader("应用") }
            item {
                LiuliCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Palette, null)
                        Text("主题模式", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp))
                    }
                    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        ThemeMode.entries.forEach { mode ->
                            FilterChip(selected = themeMode == mode, onClick = { onThemeChange(mode) }, label = { Text(mode.label) })
                        }
                    }
                }
            }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    SettingsRow(Icons.Outlined.Dns, "服务地址", server.removeSuffix("/"), onEditServer)
                    SettingsRow(Icons.Outlined.EditNote, "本地草稿", "$draftCount 条草稿 · 仅保存在本机", {})
                    SettingsRow(
                        Icons.Outlined.DeleteSweep,
                        "报告缓存",
                        "$cacheFiles 个文件 · 点击清理",
                        onClick = {
                            scope.launch {
                                withContext(Dispatchers.IO) {
                                    context.cacheDir.resolve("reports").listFiles()?.forEach { it.delete() }
                                }
                                refreshCacheCount()
                            }
                        },
                        showDivider = false,
                    )
                }
            }
            item { SectionHeader("账户") }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    SettingsRow(Icons.Outlined.Lock, "修改密码", "成功后保持当前登录", { passwordDialog = true })
                    SettingsRow(Icons.AutoMirrored.Outlined.Logout, "退出登录", "清除本机 Token", onLogout, showDivider = false)
                }
            }
            item { SectionHeader("关于") }
            item {
                LiuliListCard(Modifier.fillMaxWidth()) {
                    LiuliListRow(
                        title = "琉璃 Android",
                        subtitle = "版本 ${BuildConfig.VERSION_NAME} · 个人研究助手\nAndroid 16 · 小米 17 竖屏优化",
                        leading = { LiuliBrandMark(size = 36.dp, cornerRadius = 10.dp, iconPadding = 5.dp) },
                        showDivider = false,
                    )
                }
            }
        }
    }

    if (passwordDialog) {
        ChangePasswordDialog(api = api, onDismiss = { passwordDialog = false })
    }
}

@Composable
private fun SettingsRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    showDivider: Boolean = true,
) {
    LiuliListRow(
        title = title,
        subtitle = subtitle,
        leading = { Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(2.dp)) },
        onClick = onClick,
        showDivider = showDivider,
    )
}

@Composable
private fun ChangePasswordDialog(api: ApiService, onDismiss: () -> Unit) {
    var old by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("修改密码") },
        text = {
            Column {
                OutlinedTextField(old, { old = it }, label = { Text("当前密码") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                OutlinedTextField(next, { next = it }, label = { Text("新密码") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.padding(top = 8.dp))
                message?.let { Text(it, color = if (it == "密码已更新") LocalLiuliColors.current.success else MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
            }
        },
        confirmButton = {
            Button(
                enabled = old.isNotBlank() && next.isNotBlank() && !busy,
                onClick = {
                    scope.launch {
                        busy = true
                        runCatching { api.changePassword(ChangePasswordRequest(old, next)) }
                            .onSuccess { message = "密码已更新"; old = ""; next = "" }
                            .onFailure { message = "当前密码不正确或请求失败" }
                        busy = false
                    }
                },
            ) { Text(if (busy) "保存中" else "保存") }
        },
        dismissButton = { OutlinedButton(onClick = onDismiss) { Text("关闭") } },
    )
}
