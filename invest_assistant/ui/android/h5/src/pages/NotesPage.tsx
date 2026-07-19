import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime } from "../utils/format";

export function NotesPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [groupId, setGroupId] = useState("all");
  const [composer, setComposer] = useState(false);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [manageGroups, setManageGroups] = useState(false);
  const groups = useQuery({ queryKey: ["note-groups"], queryFn: mobileApi.noteGroups });
  const groupItems = useMemo(() => [{ key: "all", label: "全部" }, ...(groups.data ?? []).filter((item) => item.status === "active").map((item) => ({ key: String(item.id), label: item.name }))], [groups.data]);
  const notes = useQuery({
    queryKey: ["notes", groupId],
    queryFn: () => mobileApi.notes({ limit: 30, offset: 0, status: "active", group_id: groupId === "all" ? undefined : Number(groupId) })
  });
  const create = useMutation({
    mutationFn: () => mobileApi.createNote({ content: content.trim(), group_id: groupId === "all" ? null : Number(groupId), tags: tags.trim() || null }),
    onSuccess: async () => { setContent(""); setTags(""); setComposer(false); await client.invalidateQueries({ queryKey: ["notes"] }); }
  });

  return (
    <MobilePageFrame navigation={<SecondaryNavigation items={groupItems} activeKey={groupId} onChange={setGroupId} />}>
      <div className="note-toolbar"><button type="button" className="text-button" onClick={() => setManageGroups(true)}>编辑分组</button></div>
      {notes.isLoading ? <LoadingState /> : notes.isError ? <ErrorState onRetry={() => void notes.refetch()} /> : notes.data?.items.length ? <div className="note-list">{notes.data.items.map((note) => <article className="note-card" key={note.id} onClick={() => navigate(`/notes/${note.id}`)}><header><time>{formatDateTime(note.updated_at ?? note.created_at)}</time><MoreHorizontal size={20} /></header><p>{note.content}</p>{note.tags?.length ? <footer>{note.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</footer> : null}</article>)}</div> : <EmptyState title="这个分组还没有笔记" detail="记录一条现在的想法" />}
      <button className="floating-button" type="button" aria-label="新增笔记" onClick={() => setComposer(true)}><Plus /></button>
      {composer ? <div className="sheet-backdrop"><section className="composer-sheet"><header><strong>现在的想法是…</strong><button type="button" onClick={() => setComposer(false)}><X /></button></header><textarea autoFocus value={content} onChange={(event) => setContent(event.target.value)} placeholder="写下一条短笔记" /><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用逗号分隔" /><button type="button" className="primary-button" disabled={!content.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "保存中…" : "保存"}</button></section></div> : null}
      {manageGroups ? <GroupManager groups={groups.data ?? []} onClose={() => setManageGroups(false)} /> : null}
    </MobilePageFrame>
  );
}

function GroupManager({ groups, onClose }: { groups: Awaited<ReturnType<typeof mobileApi.noteGroups>>; onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({ mutationFn: () => mobileApi.createNoteGroup(name.trim()), onSuccess: async () => { setName(""); await client.invalidateQueries({ queryKey: ["note-groups"] }); } });
  return <div className="sheet-backdrop"><section className="composer-sheet group-manager"><header><strong>笔记分组</strong><button type="button" onClick={onClose}><X /></button></header>{groups.filter((item) => item.status === "active").map((group) => <div className="group-row" key={group.id}><span>{group.name}</span><button type="button" onClick={async () => { await mobileApi.updateNoteGroup({ ...group, status: "archived" }); await client.invalidateQueries({ queryKey: ["note-groups"] }); }}>移除</button></div>)}<div className="group-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="新分组名称" /><button type="button" disabled={!name.trim()} onClick={() => create.mutate()}>添加</button></div></section></div>;
}
