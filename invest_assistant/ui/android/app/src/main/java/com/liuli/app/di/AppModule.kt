package com.liuli.app.di

import android.content.Context
import com.liuli.app.core.common.AppPreferences
import com.liuli.app.core.common.ProcessCache
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun preferences(@ApplicationContext context: Context): AppPreferences = AppPreferences(context)

    @Provides
    @Singleton
    fun processCache(): ProcessCache = ProcessCache()
}
