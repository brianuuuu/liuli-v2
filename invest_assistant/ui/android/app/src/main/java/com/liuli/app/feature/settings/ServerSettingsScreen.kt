package com.liuli.app.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.liuli.app.BuildConfig
import com.liuli.app.core.design.LiuliAppBar
import com.liuli.app.core.design.LiuliCard

@Composable
fun ServerSettingsScreen(
    value: String,
    error: String?,
    onValueChange: (String) -> Unit,
    onSave: () -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        LiuliAppBar("服务器设置", "保存后需要重新登录", onBack = onBack)
        Column(Modifier.padding(16.dp)) {
            LiuliCard(Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.Dns, null, tint = MaterialTheme.colorScheme.primary)
                Text("个人服务器地址", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                Text("支持 HTTP / HTTPS、端口和子路径。离线时仍可进入应用并修改此地址。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    label = { Text("服务器 URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                )
                if (!error.isNullOrBlank()) Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))
                Button(onClick = onSave, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("保存并重新登录") }
                OutlinedButton(
                    onClick = { onValueChange(BuildConfig.DEFAULT_SERVER_URL) },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) { Text("恢复默认地址") }
            }
        }
    }
}
