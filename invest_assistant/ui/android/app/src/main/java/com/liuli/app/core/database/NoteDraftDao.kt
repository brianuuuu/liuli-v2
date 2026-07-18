package com.liuli.app.core.database

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDraftDao {
    @Query("SELECT * FROM note_draft ORDER BY updated_at DESC")
    fun observeAll(): Flow<List<NoteDraftEntity>>

    @Query("SELECT * FROM note_draft WHERE local_id = :localId LIMIT 1")
    suspend fun get(localId: String): NoteDraftEntity?

    @Upsert
    suspend fun upsert(entity: NoteDraftEntity)

    @Delete
    suspend fun delete(entity: NoteDraftEntity)

    @Query("DELETE FROM note_draft WHERE local_id = :localId")
    suspend fun deleteById(localId: String)
}
