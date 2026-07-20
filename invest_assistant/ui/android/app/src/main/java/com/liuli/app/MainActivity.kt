package com.liuli.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import com.liuli.app.core.common.AppPreferences
import com.liuli.app.core.design.LiuliTheme
import com.liuli.app.core.design.ThemeMode
import com.liuli.app.hybrid.HybridSection
import com.liuli.app.hybrid.mobileAppUrl
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONTokener
import java.io.File
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {
    private lateinit var preferences: AppPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferences = AppPreferences(applicationContext)
        setContent {
            HybridApp(
                preferences = preferences,
                openDownloadedFile = ::downloadAndOpen,
            )
        }
    }

    private fun downloadAndOpen(
        webView: WebView,
        server: String,
        relativeUrl: String,
        requestedName: String,
    ) {
        webView.evaluateJavascript("window.localStorage.getItem('liuli.mobile.auth.token')") { encoded ->
            val token = runCatching { JSONTokener(encoded).nextValue()?.toString() }.getOrNull()
            val absoluteUrl = Uri.parse(server).buildUpon()
                .encodedPath(relativeUrl.substringBefore("?"))
                .encodedQuery(relativeUrl.substringAfter("?", "").ifBlank { null })
                .build()
                .toString()
            Thread {
                runCatching {
                    val request = Request.Builder()
                        .url(absoluteUrl)
                        .apply { if (!token.isNullOrBlank() && token != "null") header("Authorization", "Bearer $token") }
                        .build()
                    val client = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
                    client.newCall(request).execute().use { response ->
                        check(response.isSuccessful) { "下载失败（${response.code}）" }
                        val safeName = requestedName.replace(Regex("[\\\\/:*?\"<>|]"), "_")
                        val directory = File(cacheDir, "reports").apply { mkdirs() }
                        val file = File(directory, safeName)
                        file.outputStream().use { output -> response.body?.byteStream()?.copyTo(output) }
                        runOnUiThread { openFile(file) }
                    }
                }
            }.start()
        }
    }

    private fun openFile(file: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "text/markdown")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "text/markdown"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }, "打开报告"))
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun HybridApp(
    preferences: AppPreferences,
    openDownloadedFile: (WebView, String, String, String) -> Unit,
) {
    val activity = LocalActivity.current ?: return
    val server by preferences.server.collectAsState(initial = BuildConfig.DEFAULT_SERVER_URL)
    val themeMode by preferences.themeMode.collectAsState(initial = ThemeMode.System)
    val scope = rememberCoroutineScope()
    var selectedSection by remember { mutableStateOf(HybridSection.Dashboard) }
    var showBottomNavigation by remember { mutableStateOf(false) }
    var canHandleBack by remember { mutableStateOf(false) }
    var loadFailed by remember(server) { mutableStateOf(false) }
    var loading by remember(server) { mutableStateOf(true) }
    var serverDraft by remember(server) { mutableStateOf(server) }
    var webView by remember(server) { mutableStateOf<WebView?>(null) }

    LiuliTheme(themeMode) {
        val systemChromeBackground = if (MaterialTheme.colorScheme.surface == Color.White) Color.White else Color.Black
        Scaffold(
            containerColor = systemChromeBackground,
            contentWindowInsets = WindowInsets.systemBars.only(
                WindowInsetsSides.Top + WindowInsetsSides.Horizontal,
            ),
            bottomBar = {
                if (showBottomNavigation && !loadFailed) {
                    HybridBottomBar(
                        selected = selectedSection,
                        background = systemChromeBackground,
                        onSelected = { section ->
                            selectedSection = section
                            webView?.evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('liuli:navigate',{detail:{section:'${section.route}'}}))",
                                null,
                            )
                        },
                    )
                }
            },
        ) { paddingValues ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .background(systemChromeBackground),
            ) {
                if (loadFailed) {
                    LoadFailure(
                        value = serverDraft,
                        onValueChange = { serverDraft = it },
                        onRetry = {
                            if (serverDraft.trim() != server) {
                                scope.launch { preferences.saveServer(normalizeServer(serverDraft)) }
                            } else {
                                loadFailed = false
                                loading = true
                                webView?.reload()
                            }
                        },
                        onRestore = {
                            serverDraft = BuildConfig.DEFAULT_SERVER_URL
                            scope.launch { preferences.saveServer(BuildConfig.DEFAULT_SERVER_URL) }
                        },
                    )
                } else {
                    key(server) {
                        AndroidView(
                            factory = { context ->
                                WebView(context).apply {
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                settings.setSupportZoom(false)
                                isVerticalScrollBarEnabled = false
                                overScrollMode = WebView.OVER_SCROLL_NEVER
                                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                                addJavascriptInterface(
                                    LiuliJavascriptBridge(
                                        onNavigationState = { section, visible, handleBack ->
                                            activity.runOnUiThread {
                                                selectedSection = HybridSection.entries.firstOrNull { it.route == section }
                                                    ?: HybridSection.Dashboard
                                                showBottomNavigation = visible
                                                canHandleBack = handleBack
                                            }
                                        },
                                        onTheme = { mode ->
                                            scope.launch { preferences.saveTheme(ThemeMode.fromStorage(mode)) }
                                        },
                                        onServer = { next ->
                                            scope.launch { preferences.saveServer(normalizeServer(next)) }
                                        },
                                        onDownload = { url, filename ->
                                            activity.runOnUiThread { openDownloadedFile(this, server, url, filename) }
                                        },
                                    ),
                                    "LiuliNative",
                                )
                                webViewClient = LiuliWebViewClient(
                                    server = server,
                                    onLoading = {
                                        loading = it
                                        if (it) loadFailed = false
                                    },
                                    onFailure = {
                                        loading = false
                                        loadFailed = true
                                        showBottomNavigation = false
                                        canHandleBack = false
                                    },
                                )
                                loadUrl(mobileAppUrl(server))
                                webView = this
                                }
                            },
                            modifier = Modifier.fillMaxSize(),
                            onRelease = { releasedWebView ->
                                releasedWebView.removeJavascriptInterface("LiuliNative")
                                releasedWebView.destroy()
                            },
                        )
                    }
                    if (loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }

    BackHandler(enabled = canHandleBack) {
        webView?.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('liuli:back'))",
            null,
        )
    }
}

private class LiuliJavascriptBridge(
    val onNavigationState: (String, Boolean, Boolean) -> Unit,
    val onTheme: (String) -> Unit,
    val onServer: (String) -> Unit,
    val onDownload: (String, String) -> Unit,
) {
    @JavascriptInterface
    fun setNavigationState(section: String, showBottomBar: Boolean, canHandleBack: Boolean) =
        onNavigationState(section, showBottomBar, canHandleBack)

    @JavascriptInterface
    fun setTheme(mode: String) = onTheme(mode)

    @JavascriptInterface
    fun setServer(url: String) = onServer(url)

    @JavascriptInterface
    fun openDownloadedFile(url: String, filename: String) = onDownload(url, filename)

    @JavascriptInterface
    fun logout() = onNavigationState("dashboard", false, false)
}

private class LiuliWebViewClient(
    private val server: String,
    private val onLoading: (Boolean) -> Unit,
    private val onFailure: () -> Unit,
) : WebViewClient() {
    private val serverUri = Uri.parse(server)

    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
        onLoading(true)
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        onLoading(false)
    }

    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
        if (request?.isForMainFrame == true) onFailure()
    }

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val uri = request?.url ?: return false
        val sameServer = uri.scheme == serverUri.scheme && uri.host == serverUri.host && uri.port == serverUri.port
        if (sameServer) {
            return false
        }
        view?.context?.startActivity(Intent(Intent.ACTION_VIEW, uri))
        return true
    }
}

@Composable
private fun HybridBottomBar(
    selected: HybridSection,
    background: Color,
    onSelected: (HybridSection) -> Unit,
) {
    Surface(
        color = background,
        tonalElevation = 0.dp,
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars.only(WindowInsetsSides.Bottom)),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                HybridSection.entries.forEach { section ->
                    val active = section == selected
                    TextButton(
                        onClick = { onSelected(section) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Icon(
                                imageVector = section.icon(),
                                contentDescription = null,
                                tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = section.label,
                                color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LoadFailure(
    value: String,
    onValueChange: (String) -> Unit,
    onRetry: () -> Unit,
    onRestore: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("手机页面加载失败", style = MaterialTheme.typography.titleLarge)
        Text(
            "检查网络或修改服务器地址后重试。",
            modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text("服务器地址") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = onRetry, modifier = Modifier.fillMaxWidth().padding(top = 14.dp)) {
            Text("保存并重试")
        }
        TextButton(onClick = onRestore) { Text("恢复默认地址") }
    }
}

private fun normalizeServer(raw: String): String {
    val value = raw.trim()
    val withScheme = if (value.startsWith("http://") || value.startsWith("https://")) value else "http://$value"
    return "${withScheme.trimEnd('/')}/"
}

private fun HybridSection.icon(): ImageVector = when (this) {
    HybridSection.Dashboard -> Icons.Outlined.Dashboard
    HybridSection.News -> Icons.Outlined.Newspaper
    HybridSection.Notes -> Icons.Outlined.EditNote
    HybridSection.Tasks -> Icons.Outlined.Notifications
    HybridSection.Me -> Icons.Outlined.AccountCircle
}
