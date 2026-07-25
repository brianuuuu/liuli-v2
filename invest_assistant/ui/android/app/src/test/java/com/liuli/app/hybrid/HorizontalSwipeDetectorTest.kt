package com.liuli.app.hybrid

import org.junit.Assert.assertEquals
import org.junit.Test

class HorizontalSwipeDetectorTest {
    @Test
    fun `a slow drag beyond one quarter of the viewport changes page`() {
        val detector = HorizontalSwipeDetector()

        detector.start(x = 300f, y = 400f)

        assertEquals(
            SwipeOutcome.Next,
            detector.finish(
                x = 190f,
                y = 408f,
                viewportWidthPx = 400f,
                density = 1f,
                velocityXPxPerSecond = -100f,
            ),
        )
    }

    @Test
    fun `a fast short fling changes page in either direction`() {
        val detector = HorizontalSwipeDetector()

        detector.start(x = 300f, y = 400f)
        assertEquals(
            SwipeOutcome.Next,
            detector.finish(270f, 404f, viewportWidthPx = 400f, density = 1f, velocityXPxPerSecond = -750f),
        )

        detector.start(x = 100f, y = 400f)
        assertEquals(
            SwipeOutcome.Previous,
            detector.finish(130f, 396f, viewportWidthPx = 400f, density = 1f, velocityXPxPerSecond = 750f),
        )
    }

    @Test
    fun `short slow vertical diagonal and cancelled gestures return cancel`() {
        val detector = HorizontalSwipeDetector()

        detector.start(x = 300f, y = 400f)
        assertEquals(
            SwipeOutcome.Cancel,
            detector.finish(270f, 402f, viewportWidthPx = 400f, density = 1f, velocityXPxPerSecond = -60f),
        )

        detector.start(x = 200f, y = 600f)
        assertEquals(
            SwipeOutcome.Cancel,
            detector.finish(190f, 350f, viewportWidthPx = 400f, density = 1f, velocityXPxPerSecond = -900f),
        )

        detector.start(x = 300f, y = 400f)
        assertEquals(
            SwipeOutcome.Cancel,
            detector.finish(220f, 300f, viewportWidthPx = 400f, density = 1f, velocityXPxPerSecond = -900f),
        )

        detector.start(x = 300f, y = 400f)
        assertEquals(SwipeOutcome.Cancel, detector.cancel())
    }
}
