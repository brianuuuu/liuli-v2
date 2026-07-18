package com.liuli.app.core.common

class ProcessCache(var now: () -> Long = System::currentTimeMillis) {
    private data class Entry(val value: Any, val savedAtMillis: Long)
    private val entries = mutableMapOf<String, Entry>()

    fun put(key: String, value: Any) {
        entries[key] = Entry(value, now())
    }

    @Suppress("UNCHECKED_CAST")
    fun <T> get(key: String): T? {
        val entry = entries[key] ?: return null
        if (!CachePolicy.isFresh(entry.savedAtMillis, now())) {
            entries.remove(key)
            return null
        }
        return entry.value as? T
    }

    fun clear() = entries.clear()
}
