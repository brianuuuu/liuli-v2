package com.liuli.app.hybrid

import kotlin.math.abs

enum class SwipeDirection(val wireValue: String) {
    Previous("previous"),
    Next("next"),
}

class HorizontalSwipeDetector(
    private val thresholdPx: Float,
    private val axisDominanceRatio: Float = 1.2f,
) {
    private var startX: Float? = null
    private var startY: Float? = null

    fun start(x: Float, y: Float) {
        startX = x
        startY = y
    }

    fun finish(x: Float, y: Float): SwipeDirection? {
        val initialX = startX
        val initialY = startY
        cancel()
        if (initialX == null || initialY == null) return null

        val deltaX = x - initialX
        val deltaY = y - initialY
        if (abs(deltaX) <= thresholdPx || abs(deltaX) <= abs(deltaY) * axisDominanceRatio) {
            return null
        }
        return if (deltaX < 0) SwipeDirection.Next else SwipeDirection.Previous
    }

    fun cancel() {
        startX = null
        startY = null
    }
}
