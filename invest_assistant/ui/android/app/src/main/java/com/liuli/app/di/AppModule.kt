package com.liuli.app.di

import android.content.Context
import com.liuli.app.core.common.AppPreferences
import com.liuli.app.core.common.ProcessCache
import com.liuli.app.core.database.LiuliDatabase
import com.liuli.app.core.database.NoteDraftDao
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
    fun database(@ApplicationContext context: Context): LiuliDatabase = LiuliDatabase.get(context)

    @Provides
    fun draftDao(database: LiuliDatabase): NoteDraftDao = database.noteDraftDao()

    @Provides
    @Singleton
    fun processCache(): ProcessCache = ProcessCache()
}
