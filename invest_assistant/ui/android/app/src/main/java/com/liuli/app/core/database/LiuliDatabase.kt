package com.liuli.app.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [NoteDraftEntity::class], version = 1, exportSchema = true)
abstract class LiuliDatabase : RoomDatabase() {
    abstract fun noteDraftDao(): NoteDraftDao

    companion object {
        @Volatile private var instance: LiuliDatabase? = null

        fun get(context: Context): LiuliDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                LiuliDatabase::class.java,
                "liuli_android.sqlite3",
            ).build().also { instance = it }
        }
    }
}
