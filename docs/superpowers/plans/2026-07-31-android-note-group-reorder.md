# Android Note Group Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users long-press and drag active note groups, saving the complete order atomically.

**Architecture:** Add a transactional knowledge-base reorder service and route, expose it through `mobileApi`, then implement a focused `ReorderableNoteGroups` component using Pointer Events and a 350ms hold threshold. Keep “全部” outside persisted order and update React Query optimistically with rollback.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, React 18, TypeScript, Vitest, Testing Library.

## Global Constraints

- “全部” remains fixed first and is never sent to the backend.
- Save the complete active custom-group order atomically.
- Do not change note ordering or Web UI.
- Back up `var/db/liuli.sqlite3` before approved database tests; tests use isolated temporary SQLite only.

---

### Task 1: Add Atomic Note Group Reorder API

**Files:**
- Modify: `invest_assistant/modules/knowledge_base/schemas.py`
- Modify: `invest_assistant/modules/knowledge_base/service.py`
- Modify: `invest_assistant/modules/knowledge_base/router.py`
- Test: `tests/unit/test_knowledge_note_groups.py`

**Interfaces:**
- Produces `KnowledgeNoteGroupReorder(ordered_ids: list[int])`.
- Produces `reorder_note_groups(db: Session, ordered_ids: list[int]) -> list[KnowledgeNoteGroup]`.
- Produces `PUT /api/knowledge/note-groups/reorder` returning `list[KnowledgeNoteGroupRead]`.

- [ ] Write failing service tests for successful continuous `sort_order`, duplicate IDs, missing active IDs, archived IDs, and unknown IDs; assert rejected requests leave every original order unchanged.
- [ ] Run the explicitly approved focused pytest command and verify RED because the schema/service do not exist.
- [ ] Add the reorder schema with `Field(min_length=1)` and duplicate validation.
- [ ] Implement one-query active group loading, exact set equality validation, sequential `sort_order` assignment, one commit, and ordered return.
- [ ] Map validation failures to `400` and unknown IDs to `404` in the route without partial commits.
- [ ] Run the approved tests and verify GREEN.
- [ ] Commit with `git commit -m "feat(knowledge): add atomic note group reorder"`.

### Task 2: Add Long-Press Drag UI

**Files:**
- Create: `invest_assistant/ui/android/h5/src/components/ReorderableNoteGroups.tsx`
- Modify: `invest_assistant/ui/android/h5/src/pages/NotesPage.tsx`
- Modify: `invest_assistant/ui/android/h5/src/api/mobileApi.ts`
- Modify: `invest_assistant/ui/android/h5/src/styles.css`
- Test: `invest_assistant/ui/android/h5/tests/note-group-reorder.test.tsx`
- Test: `invest_assistant/ui/android/h5/tests/app.test.tsx`

**Interfaces:**
- Consumes `groups: NoteGroup[]`, `disabled: boolean`, `onReorder(orderedIds: number[]): Promise<void>`, and `onArchive(group: NoteGroup): Promise<void>`.
- Produces `mobileApi.reorderNoteGroups(orderedIds: number[]): Promise<NoteGroup[]>`.
- Changes `mobileApi.createNoteGroup(name, sortOrder)` so new groups append at `max(sort_order) + 1`.

- [ ] Write failing component tests using controlled pointer timestamps for under-350ms cancellation, vertical movement cancellation before activation, activated upward/downward reorder, and exclusion of remove buttons.
- [ ] Write a failing integration test asserting the request contains all active custom IDs, never “全部”, updates tabs on success, and rolls back with an error message on rejection.
- [ ] Run focused Vitest files and verify RED because the component and API method do not exist.
- [ ] Implement the pointer state machine with one hold timer, movement tolerance, pointer capture, row-center swaps, `data-swipe-ignore`, and cleanup on unmount.
- [ ] Add bounded edge auto-scroll using animation frames only while dragging.
- [ ] In `GroupManager`, keep local ordered groups, optimistically update query data, call the atomic endpoint, rollback on failure, and disable drag/archive while saving.
- [ ] Add compact grip/placeholder/dragging/error styles and ensure the sheet list can scroll without horizontal overflow.
- [ ] Run focused tests and Android typecheck; verify GREEN.
- [ ] Commit with `git commit -m "feat(android): reorder note groups by long press"`.

### Task 3: Verify Note Group Ordering

**Files:**
- Verify only: backend and Android targets.

**Interfaces:**
- Consumes Tasks 1-2.
- Produces verification evidence only.

- [ ] Run the explicitly approved note-group backend tests.
- [ ] Run Android full tests, typecheck, and production build.
- [ ] Run `git diff --check` and confirm no unrelated changes.
