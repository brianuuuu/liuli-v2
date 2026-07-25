package com.liuli.app.hybrid

import kotlin.math.abs

enum class SwipeOutcome(val wireValue: String) {
    Cancel("cancel"),
    Previous("previous"),
    Next("next"),
}

class HorizontalSwipeDetector(
    private val distanceFraction: Float = 0.25f,
    private val minimumFlingDistanceDp: Float = 24f,
    private val minimumFlingVelocityDpPerSecond: Float = 600f,
    private val axisDominanceRatio: Float = 1.2f,
) {
    private var startX: Float? = null
    private var startY: Float? = null

    fun start(x: Float, y: Float) {
        startX = x
        startY = y
    }

    fun finish(
        x: Float,
        y: Float,
        viewportWidthPx: Float,
        density: Float,
        velocityXPxPerSecond: Float,
    ): SwipeOutcome {
        val initialX = startX
        val initialY = startY
        reset()
        if (initialX == null || initialY == null) return SwipeOutcome.Cancel

        val deltaX = x - initialX
        val deltaY = y - initialY
        val absoluteX = abs(deltaX)
        if (absoluteX <= abs(deltaY) * axisDominanceRatio) return SwipeOutcome.Cancel

        val safeDensity = density.coerceAtLeast(1f)
        val distanceDp = absoluteX / safeDensity
        val velocityDpPerSecond = abs(velocityXPxPerSecond) / safeDensity
        val velocityMatchesDirection = velocityXPxPerSecond == 0f || velocityXPxPerSecond * deltaX > 0
        val crossesDistanceThreshold = absoluteX >= viewportWidthPx * distanceFraction
        val crossesVelocityThreshold =
            distanceDp >= minimumFlingDistanceDp &&
                velocityMatchesDirection &&
                velocityDpPerSecond >= minimumFlingVelocityDpPerSecond
        if (!crossesDistanceThreshold && !crossesVelocityThreshold) {
            return SwipeOutcome.Cancel
        }
        return if (deltaX < 0) SwipeOutcome.Next else SwipeOutcome.Previous
    }

    fun cancel(): SwipeOutcome {
        reset()
        return SwipeOutcome.Cancel
    }

    private fun reset() {
        startX = null
        startY = null
    }
}
