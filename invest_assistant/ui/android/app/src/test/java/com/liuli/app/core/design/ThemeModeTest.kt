package com.liuli.app.core.design

import org.junit.Assert.assertEquals
import org.junit.Test

class ThemeModeTest {
    @Test
    fun `stored values map to supported modes and unknown values follow system`() {
        assertEquals(ThemeMode.Light, ThemeMode.fromStorage("light"))
        assertEquals(ThemeMode.Dark, ThemeMode.fromStorage("dark"))
        assertEquals(ThemeMode.System, ThemeMode.fromStorage("system"))
        assertEquals(ThemeMode.System, ThemeMode.fromStorage("unexpected"))
        assertEquals(ThemeMode.System, ThemeMode.fromStorage(null))
    }
}
