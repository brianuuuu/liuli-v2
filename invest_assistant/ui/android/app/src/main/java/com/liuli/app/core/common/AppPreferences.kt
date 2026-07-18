package com.liuli.app.core.common

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.liuli.app.BuildConfig
import com.liuli.app.core.design.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.liuliDataStore by preferencesDataStore(name = "liuli_preferences")

class AppPreferences(private val context: Context) {
    private object Keys {
        val server = stringPreferencesKey("server_url")
        val token = stringPreferencesKey("access_token")
        val theme = stringPreferencesKey("theme_mode")
    }

    val server: Flow<String> = context.liuliDataStore.data.map {
        it[Keys.server] ?: BuildConfig.DEFAULT_SERVER_URL
    }
    val token: Flow<String?> = context.liuliDataStore.data.map { it[Keys.token] }
    val themeMode: Flow<ThemeMode> = context.liuliDataStore.data.map {
        ThemeMode.fromStorage(it[Keys.theme])
    }

    suspend fun saveServer(value: String) {
        context.liuliDataStore.edit {
            it[Keys.server] = value
            it.remove(Keys.token)
        }
    }

    suspend fun saveToken(value: String) {
        context.liuliDataStore.edit { it[Keys.token] = value }
    }

    suspend fun clearToken() {
        context.liuliDataStore.edit { it.remove(Keys.token) }
    }

    suspend fun saveTheme(mode: ThemeMode) {
        context.liuliDataStore.edit { it[Keys.theme] = mode.storageValue }
    }
}
