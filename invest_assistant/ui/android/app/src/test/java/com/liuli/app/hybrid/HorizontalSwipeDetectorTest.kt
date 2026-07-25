package com.liuli.app.hybrid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HorizontalSwipeDetectorTest {
    @Test
    fun `recognizes only dominant horizontal swipes beyond the threshold`() {
        val detector = HorizontalSwipeDetector(thresholdPx = 60f)

        detector.start(300f, 400f)
        assertEquals(SwipeDirection.Next, detector.finish(190f, 408f))

        detector.start(100f, 400f)
        assertEquals(SwipeDirection.Previous, detector.finish(210f, 392f))

        detector.start(300f, 400f)
        assertNull(detector.finish(250f, 402f))

        detector.start(300f, 400f)
        assertNull(detector.finish(220f, 300f))
    }

    @Test
    fun `a vertical gesture stays unhandled`() {
        val detector = HorizontalSwipeDetector(thresholdPx = 60f)

        detector.start(200f, 600f)

        assertNull(detector.finish(190f, 350f))
    }
}
