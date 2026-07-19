package com.liuli.app.feature.notes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotesPresentationTest {
    @Test
    fun extractsDistinctHashtagsForExistingNoteApi() {
        assertEquals("#机器人 #年报", extractHashtags("关注 #机器人 和 #年报，再看 #机器人"))
    }

    @Test
    fun plainMemoWithoutHashtagsDoesNotSendTagsField() {
        assertNull(extractHashtags("今天重点复盘组合回撤"))
    }
}
