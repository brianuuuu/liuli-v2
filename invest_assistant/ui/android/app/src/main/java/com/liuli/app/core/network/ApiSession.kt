package com.liuli.app.core.network

import com.liuli.app.core.common.ProcessCache
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

@Singleton
class ApiSession @Inject constructor(
    private val cache: ProcessCache,
) {
    private var key: String? = null
    private var current: ApiService? = null
    private val unauthorizedSent = AtomicBoolean(false)
    private val unauthorizedEvents = Channel<Unit>(capacity = Channel.CONFLATED)
    val unauthorized = unauthorizedEvents.receiveAsFlow()

    fun configure(server: String, token: String?) {
        val nextKey = "$server|${token.orEmpty()}"
        if (nextKey != key) {
            if (key != null) cache.clear()
            unauthorizedSent.set(false)
            current = ApiClient.create(server, token) {
                if (unauthorizedSent.compareAndSet(false, true)) unauthorizedEvents.trySend(Unit)
            }
            key = nextKey
        }
    }

    fun api(): ApiService = checkNotNull(current) { "API session is not configured" }
}
