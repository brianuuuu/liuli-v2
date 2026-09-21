import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { mobileApi } from "../api/mobileApi";
import { PullToRefresh } from "../components/PullToRefresh";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import type { KnowledgeNote } from "../types/api";
import { formatDateTime } from "../utils/format";

function failureText(error: unknown, fallback: string) {
  const detail = error instanceof ApiError ? error.detail : undefined;
  return detail ? `${fallback}：${detail}` : fallback;
}

/**
 * 待办里的笔记：只收 MCP 写进来的未分组笔记。
 *
 * 待办的口径是"外部输入等我处理"，自己随手记的未分组笔记在笔记页的未分组页签里整理，
 * 不占这里。处理动作就是归入一个分组，归完即从待办消失；标签留到笔记页再打，
 * 标签选择的交互重得多，塞进来会把这个轻量动作拖慢。
 */
export function InboxNotesPanel() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [assigning, setAssigning] = useState<KnowledgeNote | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const query = useQuery({
    queryKey: ["inbox-notes"],
    queryFn: () => mobileApi.notes({ limit: 30, offset: 0, status: "active", ungrouped: true, note_type: "mcp" })
  });
  const groups = useQuery({ queryKey: ["note-groups"], queryFn: mobileApi.noteGroups });
  const rows = query.data?.items ?? [];
  const activeGroups = (groups.data ?? []).filter((item) => item.status === "active");

  const refresh = async () => {
    setFeedback("");
    const [refetched] = await Promise.all([query.refetch(), client.refetchQueries({ queryKey: ["note-groups"] })]);
    if (refetched.isError) throw refetched.error;
  };

  const assignGroup = async (note: KnowledgeNote, groupId: number, groupName: string) => {
    setBusyId(note.id);
    setFeedback("");
    try {
      // 归组走通用的笔记更新接口，正文和标签原样带回去，这里只改分组。
      await mobileApi.updateNote(note.id, {
        content: note.content,
        group_id: groupId,
        tag_ids: note.tags?.map((tag) => tag.id) ?? []
      });
      setFeedback(`已归入「${groupName}」`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["inbox-notes"] }),
        client.invalidateQueries({ queryKey: ["notes"] })
      ]);
    } catch (error) {
      setFeedback(failureText(error, "归组失败"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="tasks-panel inbox-notes-panel">
      <PullToRefresh ariaLabel="待归档笔记下拉刷新" onRefresh={refresh} disabled={busyId !== null}>
        {query.isLoading ? <LoadingState /> : query.isError ? (
          <ErrorState message="待归档笔记加载失败" onRetry={() => void query.refetch()} />
        ) : rows.length ? (
          <div className="note-list">
            {rows.map((note) => (
              <article className="note-card" data-inbox-note-id={note.id} key={note.id}>
                <header>
                  <div className="note-card-meta">
                    <time>{formatDateTime(note.updated_at ?? note.created_at)}</time>
                    <span className="note-card-source">外部写入</span>
                  </div>
                </header>
                <p onClick={() => navigate(`/notes/${note.id}`)}>{note.content}</p>
                <div className="note-card-actions" data-swipe-ignore="true">
                  <button
                    type="button"
                    className="is-assign"
                    disabled={busyId !== null || !activeGroups.length}
                    onClick={() => setAssigning(note)}
                  >
                    {busyId === note.id ? "处理中…" : activeGroups.length ? "归入分组" : "先去建分组"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="没有待归档的笔记" detail="外部写入的笔记会先落在这里，等你归入分组" />}
        {feedback ? <div className="batch-feedback" role="status">{feedback}</div> : null}
      </PullToRefresh>
      {/* 横滑分页容器带 transform，fixed 会退化成相对分页页面定位，选择弹层必须挂到 body 上。 */}
      {assigning ? createPortal(
        <div className="sheet-backdrop" data-swipe-ignore="true">
          <section className="composer-sheet" role="dialog" aria-modal="true" aria-labelledby="inbox-note-assign-title">
            <header><strong id="inbox-note-assign-title">归入哪个分组</strong></header>
            <p className="inbox-note-assign-preview">{assigning.content}</p>
            <div className="inbox-note-group-options">
              {activeGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    const target = assigning;
                    setAssigning(null);
                    void assignGroup(target, group.id, group.name);
                  }}
                >
                  {group.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAssigning(null)}>取消</button>
          </section>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
