package com.liuli.app.core.network

import java.net.URI

@JvmInline
value class ServerEndpoint private constructor(val value: String) {
    companion object {
        fun parse(raw: String): Result<ServerEndpoint> = runCatching {
            val normalized = raw.trim()
            require(normalized.isNotEmpty()) { "服务器地址不能为空" }
            val uri = URI(normalized)
            require(uri.scheme == "http" || uri.scheme == "https") { "仅支持 HTTP 或 HTTPS" }
            require(!uri.host.isNullOrBlank()) { "服务器主机无效" }
            require(uri.rawQuery == null && uri.rawFragment == null) { "服务器地址不能包含查询参数或片段" }
            val withSlash = if (normalized.endsWith('/')) normalized else "$normalized/"
            ServerEndpoint(withSlash)
        }
    }
}
