import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { PullToRefresh } from "../components/PullToRefresh";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime } from "../utils/format";

/**
 * 待办里的笔记：只收 MCP 写进来的未分组笔记。
 *
 * 待办的口径是"外部输入等我处理"，自己随手记的未分组笔记在笔记页的未分组页签里整理，
 * 不占这里。处理动作就是点开笔记去编辑——分组和标签在编辑页可以一次改完，
 * 卡片上再挂一个只能改分组的按钮既占地方又少一半能力。
 */
export function InboxNotesPanel() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["inbox-notes"],
    queryFn: () => mobileApi.notes({ limit: 30, offset: 0, status: "active", ungrouped: true, note_type: "mcp" })
  });
  const rows = query.data?.items ?? [];

  const refresh = async () => {
    const result = await query.refetch();
    if (result.isError) throw result.error;
  };

  return (
    <section className="tasks-panel inbox-notes-panel">
      <PullToRefresh ariaLabel="待归档笔记下拉刷新" onRefresh={refresh}>
        {query.isLoading ? <LoadingState /> : query.isError ? (
          <ErrorState message="待归档笔记加载失败" onRetry={() => void query.refetch()} />
        ) : rows.length ? (
          <div className="note-list">
            {rows.map((note) => (
              <article
                className="note-card"
                data-inbox-note-id={note.id}
                key={note.id}
                onClick={() => navigate(`/notes/${note.id}`)}
              >
                <header>
                  <div className="note-card-meta">
                    <time>{formatDateTime(note.updated_at ?? note.created_at)}</time>
                    <span className="note-card-source">外部写入</span>
                  </div>
                  <MoreHorizontal size={20} />
                </header>
                <p>{note.content}</p>
              </article>
            ))}
          </div>
        ) : <EmptyState title="没有待归档的笔记" detail="外部写入的笔记会先落在这里，点开分好组就不再出现" />}
      </PullToRefresh>
    </section>
  );
}
