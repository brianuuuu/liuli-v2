import { useNavigate } from "react-router-dom";
import type { KnowledgeNote } from "../types/api";
import { formatDateTime } from "../utils/format";
import { EmptyState, SectionCard } from "./Ui";

/**
 * 标的、赛道详情里的笔记。
 *
 * 笔记打的标签绑定在这个标的或赛道上，它就出现在这里，没有单独的关联动作。
 * 笔记是用户本人的重大想法，一个月也就几条，全量列出，卡片和笔记页同一套样式，点开进笔记编辑页。
 */
export function EntityNotesSection({ notes, emptyDetail }: { notes: KnowledgeNote[]; emptyDetail: string }) {
  const navigate = useNavigate();
  if (!notes.length) return <SectionCard title="我的笔记"><EmptyState title="暂无笔记" detail={emptyDetail} /></SectionCard>;
  return (
    <SectionCard title="我的笔记">
      <div className="note-list entity-note-list">
        {notes.map((note) => (
          <article className="note-card" key={note.id} onClick={() => navigate(`/notes/${note.id}`)}>
            <header>
              <div className="note-card-meta">
                <time>{formatDateTime(note.created_at ?? note.updated_at)}</time>
                {note.group ? <span className="note-card-group">{note.group.name}</span> : null}
              </div>
            </header>
            <p>{note.content}</p>
            {note.tags?.length ? <footer>{note.tags.map((tag) => <span className="note-card-tag" key={tag.id}>#{tag.name}</span>)}</footer> : null}
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
