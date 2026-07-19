package com.liuli.app.core.common

import java.text.DecimalFormat
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

enum class MarketTone { Rise, Fall, Neutral }

fun marketTone(value: Double?): MarketTone = when {
    value == null || value == 0.0 -> MarketTone.Neutral
    value > 0 -> MarketTone.Rise
    else -> MarketTone.Fall
}

fun formatMoneyWan(value: Double?): String =
    value?.let { "¥${DecimalFormat("#,##0.00").format(it)}万" } ?: "--"

fun formatMoney(value: Double?): String =
    value?.let { "¥${DecimalFormat("#,##0.00").format(it)}" } ?: "--"

fun formatSignedPercent(value: Double?): String =
    value?.let { "${if (it > 0) "+" else ""}${DecimalFormat("0.00").format(it)}%" } ?: "--"

fun formatCompactCount(value: Long?): String = when {
    value == null -> "--"
    value >= 10_000 -> "${DecimalFormat("0.0").format(value / 10_000.0)}万"
    else -> value.toString()
}

private val sourceTimeFormats = listOf(
    DateTimeFormatter.ISO_LOCAL_DATE_TIME,
    DateTimeFormatter.ofPattern("MM/dd/yyyy HH:mm:ss"),
)

private fun parseSourceTime(value: String?): LocalDateTime? {
    val text = value?.trim().orEmpty()
    if (text.isBlank()) return null
    sourceTimeFormats.forEach { formatter ->
        try {
            return LocalDateTime.parse(text.take(19), formatter)
        } catch (_: DateTimeParseException) {
            // 兼容现有接口同时返回 ISO 与美式日期格式。
        }
    }
    return null
}

fun dateBucket(value: String?): String =
    parseSourceTime(value)?.toLocalDate()?.format(DateTimeFormatter.ISO_LOCAL_DATE)
        ?: value?.takeIf { it.matches(Regex("""\d{4}-\d{2}-\d{2}.*""")) }?.take(10)
        ?: "日期未知"

fun timeLabel(value: String?): String =
    parseSourceTime(value)?.toLocalTime()?.format(DateTimeFormatter.ofPattern("HH:mm"))
        ?: "--:--"

fun reportKindLabel(value: String?): String = when (value) {
    "market" -> "市场"
    "track" -> "赛道"
    "stock" -> "标的"
    else -> "全部"
}

fun alertStatusLabel(value: String?): String = when (value) {
    "unread" -> "未读"
    "read" -> "已读"
    "handled" -> "已处理"
    else -> value.orEmpty().ifBlank { "未知" }
}
