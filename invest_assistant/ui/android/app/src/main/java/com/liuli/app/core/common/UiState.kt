package com.liuli.app.core.common

import java.io.IOException
import java.net.SocketTimeoutException
import retrofit2.HttpException

sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Content<T>(val data: T, val refreshing: Boolean = false) : UiState<T>
    data class Empty(val message: String) : UiState<Nothing>
    data class Error(val message: String, val canRetry: Boolean = true) : UiState<Nothing>
}

fun <T> UiState<T>.dataOrNull(): T? = (this as? UiState.Content<T>)?.data

object CachePolicy {
    const val PROCESS_CACHE_MILLIS: Long = 5 * 60 * 1_000L

    fun isFresh(savedAtMillis: Long, nowMillis: Long = System.currentTimeMillis()): Boolean =
        nowMillis - savedAtMillis < PROCESS_CACHE_MILLIS
}

fun Throwable.toUiMessage(fallback: String = "请求失败，请重试"): String = when (this) {
    is HttpException -> when (code()) {
        401 -> "登录已失效，请重新登录"
        404 -> "请求的内容不存在"
        in 500..599 -> "服务器暂时不可用，请稍后重试"
        else -> "请求失败（${code()}）"
    }
    is SocketTimeoutException -> "请求超时，请重试"
    is IOException -> "网络连接中断，请重试"
    else -> message?.takeIf { it.isNotBlank() } ?: fallback
}
