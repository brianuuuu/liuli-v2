package com.liuli.app.core.database

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.liuli.app.feature.notes.DraftSaveState
import com.liuli.app.feature.notes.NoteDraft

@Entity(
    tableName = "note_draft",
    indices = [Index(value = ["server_note_id"], unique = true)],
)
data class NoteDraftEntity(
    @PrimaryKey @ColumnInfo(name = "local_id") val localId: String,
    @ColumnInfo(name = "server_note_id") val serverNoteId: Long?,
    val title: String,
    val content: String,
    @ColumnInfo(name = "note_type") val noteType: String = "thesis",
    @ColumnInfo(name = "group_id") val groupId: Long? = null,
    @ColumnInfo(name = "related_module") val relatedModule: String? = null,
    @ColumnInfo(name = "related_id") val relatedId: Long? = null,
    @ColumnInfo(name = "tags_text") val tagsText: String? = null,
    @ColumnInfo(name = "tag_ids_json") val tagIdsJson: String = "[]",
    @ColumnInfo(name = "save_state") val saveState: String = "draft",
    @ColumnInfo(name = "error_message") val errorMessage: String? = null,
    @ColumnInfo(name = "updated_at") val updatedAtEpochMillis: Long,
) {
    fun toDomain(): NoteDraft = NoteDraft(
        localId = localId,
        serverNoteId = serverNoteId,
        title = title,
        content = content,
        saveState = if (saveState == "submit_failed") DraftSaveState.SubmitFailed else DraftSaveState.Draft,
        errorMessage = errorMessage,
        updatedAtEpochMillis = updatedAtEpochMillis,
    )

    companion object {
        fun fromDomain(draft: NoteDraft, metadata: NoteDraftEntity? = null): NoteDraftEntity = NoteDraftEntity(
            localId = draft.localId,
            serverNoteId = draft.serverNoteId,
            title = draft.title,
            content = draft.content,
            noteType = metadata?.noteType ?: "thesis",
            groupId = metadata?.groupId,
            relatedModule = metadata?.relatedModule,
            relatedId = metadata?.relatedId,
            tagsText = metadata?.tagsText,
            tagIdsJson = metadata?.tagIdsJson ?: "[]",
            saveState = if (draft.saveState == DraftSaveState.SubmitFailed) "submit_failed" else "draft",
            errorMessage = draft.errorMessage,
            updatedAtEpochMillis = draft.updatedAtEpochMillis,
        )
    }
}
