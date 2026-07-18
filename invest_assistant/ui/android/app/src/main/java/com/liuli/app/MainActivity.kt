package com.liuli.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.liuli.app.core.common.AppPreferences
import com.liuli.app.core.design.LiuliTheme
import com.liuli.app.core.database.LiuliDatabase
import com.liuli.app.core.network.ApiClient
import com.liuli.app.core.network.ApiSession
import com.liuli.app.core.network.LoginRequest
import com.liuli.app.core.network.ServerEndpoint
import com.liuli.app.feature.dashboard.MainShell
import com.liuli.app.feature.login.LoginScreen
import com.liuli.app.feature.settings.ServerSettingsScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import retrofit2.HttpException
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var preferences: AppPreferences
    @Inject lateinit var draftDao: com.liuli.app.core.database.NoteDraftDao
    @Inject lateinit var apiSession: ApiSession

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { LiuliRoot(preferences, draftDao, apiSession) }
    }
}

@Composable
private fun LiuliRoot(
    preferences: AppPreferences,
    draftDao: com.liuli.app.core.database.NoteDraftDao,
    apiSession: ApiSession,
) {
    val server by preferences.server.collectAsState(initial = BuildConfig.DEFAULT_SERVER_URL)
    val token by preferences.token.collectAsState(initial = null)
    val theme by preferences.themeMode.collectAsState(initial = com.liuli.app.core.design.ThemeMode.System)
    val drafts by draftDao.observeAll().collectAsStateWithLifecycle(initialValue = emptyList())
    var editingServer by remember { mutableStateOf(false) }
    var serverDraft by remember(server) { mutableStateOf(server) }
    var serverError by remember { mutableStateOf<String?>(null) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loginError by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var offlineMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LiuliTheme(theme) {
        LaunchedEffect(apiSession) {
            apiSession.unauthorized.collect { preferences.clearToken() }
        }
        if (editingServer) {
            ServerSettingsScreen(
                value = serverDraft,
                error = serverError,
                onValueChange = { serverDraft = it; serverError = null },
                onSave = {
                    ServerEndpoint.parse(serverDraft).fold(
                        onSuccess = { endpoint ->
                            scope.launch {
                                preferences.saveServer(endpoint.value)
                                editingServer = false
                                loginError = null
                            }
                        },
                        onFailure = { serverError = it.message },
                    )
                },
                onBack = { editingServer = false },
            )
        } else if (token.isNullOrBlank()) {
            LoginScreen(
                server = server,
                username = username,
                password = password,
                loading = loading,
                error = loginError,
                onUsernameChange = { username = it },
                onPasswordChange = { password = it },
                onEditServer = { serverDraft = server; editingServer = true },
                onLogin = {
                    scope.launch {
                        loading = true
                        loginError = null
                        runCatching { ApiClient.create(server).login(LoginRequest(username.trim(), password)) }
                            .onSuccess { preferences.saveToken(it.accessToken); password = "" }
                            .onFailure { loginError = readableError(it) }
                        loading = false
                    }
                },
            )
        } else {
            apiSession.configure(server, token)
            val api = remember(server, token) { apiSession.api() }
            LaunchedEffect(api) {
                runCatching { api.me() }
                    .onSuccess { offlineMessage = null }
                    .onFailure {
                        if (it is HttpException && it.code() == 401) preferences.clearToken()
                        else offlineMessage = "离线：${readableError(it)}"
                    }
            }
            MainShell(
                api = api,
                draftDao = draftDao,
                offlineMessage = offlineMessage,
                server = server,
                themeMode = theme,
                draftCount = drafts.size,
                onThemeChange = { mode -> scope.launch { preferences.saveTheme(mode) } },
                onEditServer = { serverDraft = server; editingServer = true },
                onLogout = { scope.launch { preferences.clearToken() } },
            )
        }
    }
}

private fun readableError(error: Throwable): String = when (error) {
    is HttpException -> when (error.code()) {
        401 -> "用户名或密码错误"
        in 500..599 -> "服务器暂时不可用（${error.code()}）"
        else -> "请求失败（${error.code()}）"
    }
    else -> error.message ?: "网络连接失败"
}
