package com.liuli.app.core.common

import java.text.DecimalFormat

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

fun dateBucket(value: String?): String = value
    ?.takeIf { it.length >= 10 }
    ?.substring(0, 10)
    ?: "日期未知"

fun timeLabel(value: String?): String = value
    ?.takeIf { it.length >= 16 }
    ?.substring(11, 16)
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
