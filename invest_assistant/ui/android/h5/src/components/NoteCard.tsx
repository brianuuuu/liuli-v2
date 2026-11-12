import { MoreHorizontal } from "lucide-react";
import type { KnowledgeNote } from "../types/api";
import { formatDateTime } from "../utils/format";

type Props = {
  note: KnowledgeNote;
  onOpen: (id: number) => void;
  timestamp?: string | null;
  sourceLabel?: string;
};

export function NoteCard({ note, onOpen, timestamp = note.updated_at ?? note.created_at, sourceLabel }: Props) {
  return (
    <article className="note-card" data-return-id={note.id} onClick={() => onOpen(note.id)}>
      <p>{note.content}</p>
      <footer className="note-card-meta">
        <time dateTime={timestamp ?? undefined}>{formatDateTime(timestamp)}</time>
        {note.group ? <span className="note-card-group">{note.group.name}</span> : null}
        {sourceLabel ? <span className="note-card-source">{sourceLabel}</span> : null}
        {note.tags?.length ? <span className="note-card-tags">{note.tags.map((tag) => `#${tag.name}`).join(" ")}</span> : null}
        <MoreHorizontal size={20} aria-hidden="true" />
      </footer>
    </article>
  );
}
