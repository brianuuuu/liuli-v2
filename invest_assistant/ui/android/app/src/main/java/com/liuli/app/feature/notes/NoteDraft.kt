package com.liuli.app.feature.notes

enum class DraftSaveState { Draft, SubmitFailed }

data class NoteDraft(
    val localId: String,
    val serverNoteId: Long?,
    val title: String,
    val content: String,
    val saveState: DraftSaveState = DraftSaveState.Draft,
    val errorMessage: String? = null,
    val updatedAtEpochMillis: Long,
) {
    fun markSubmitFailed(message: String, nowEpochMillis: Long): NoteDraft = copy(
        saveState = DraftSaveState.SubmitFailed,
        errorMessage = message,
        updatedAtEpochMillis = nowEpochMillis,
    )

    fun withContent(title: String, content: String, nowEpochMillis: Long): NoteDraft = copy(
        title = title,
        content = content,
        saveState = DraftSaveState.Draft,
        errorMessage = null,
        updatedAtEpochMillis = nowEpochMillis,
    )
}
