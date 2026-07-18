package com.liuli.app.feature.notes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NoteDraftPolicyTest {
    @Test
    fun `submit failure keeps draft content and records retry state`() {
        val draft = NoteDraft(
            localId = "draft-1",
            serverNoteId = null,
            title = "估值复盘",
            content = "现金流假设需要下调",
            updatedAtEpochMillis = 100L,
        )

        val failed = draft.markSubmitFailed("网络超时", nowEpochMillis = 200L)

        assertEquals("估值复盘", failed.title)
        assertEquals("现金流假设需要下调", failed.content)
        assertEquals(DraftSaveState.SubmitFailed, failed.saveState)
        assertEquals("网络超时", failed.errorMessage)
        assertEquals(200L, failed.updatedAtEpochMillis)
    }

    @Test
    fun `editing draft clears previous submit error`() {
        val failed = NoteDraft(
            localId = "draft-1",
            serverNoteId = 8L,
            title = "旧标题",
            content = "旧内容",
            saveState = DraftSaveState.SubmitFailed,
            errorMessage = "超时",
            updatedAtEpochMillis = 100L,
        )

        val edited = failed.withContent("新标题", "新内容", nowEpochMillis = 300L)

        assertEquals(DraftSaveState.Draft, edited.saveState)
        assertNull(edited.errorMessage)
        assertEquals("新标题", edited.title)
        assertEquals("新内容", edited.content)
    }
}
