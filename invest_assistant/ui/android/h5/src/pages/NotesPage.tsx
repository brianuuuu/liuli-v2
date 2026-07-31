import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import type { PagerMotionSink } from "../components/pagerMotion";
import { ReorderableNoteGroups } from "../components/ReorderableNoteGroups";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { TagPicker } from "../components/TagPicker";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime } from "../utils/format";

export function NotesPage() {
  const client = useQueryClient();
  const [groupId, setGroupId] = useState("all");
  const [composer, setComposer] = useState(false);
  const [content, setContent] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [manageGroups, setManageGroups] = useState(false);
  const [composerViewport, setComposerViewport] = useState<{ height: number; offsetTop: number } | null>(null);
  const pager = useRef<HorizontalTabPagerHandle<string>>(null);
  const navigationMotion = useRef<PagerMotionSink | null>(null);
  const groups = useQuery({ queryKey: ["note-groups"], queryFn: mobileApi.noteGroups });
  const availableTags = useQuery({ queryKey: ["tags"], queryFn: mobileApi.tags });
  const groupItems = useMemo(() => [{ key: "all", label: "全部" }, ...(groups.data ?? []).filter((item) => item.status === "active").map((item) => ({ key: String(item.id), label: item.name }))], [groups.data]);
  const create = useMutation({
    mutationFn: () => mobileApi.createNote({ content: content.trim(), group_id: groupId === "all" ? null : Number(groupId), tag_ids: tagIds }),
    onSuccess: async () => { setContent(""); setTagIds([]); setComposer(false); await client.invalidateQueries({ queryKey: ["notes"] }); }
  });
  useEffect(() => {
    if (!composer || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const syncViewport = () => setComposerViewport({ height: viewport.height, offsetTop: viewport.offsetTop });
    syncViewport();
    viewport.addEventListener("resize", syncViewport);
    viewport.addEventListener("scroll", syncViewport);
    return () => {
      viewport.removeEventListener("resize", syncViewport);
      viewport.removeEventListener("scroll", syncViewport);
      setComposerViewport(null);
    };
  }, [composer]);

  return (
    <MobilePageFrame navigation={<SecondaryNavigation ref={navigationMotion} items={groupItems} activeKey={groupId} onChange={(key) => pager.current?.requestChange(key)} endAction={{ label: "编辑分组", onClick: () => setManageGroups(true) }} />}>
      <HorizontalTabPager ref={pager} items={groupItems} activeKey={groupId} onChange={setGroupId} motionSink={navigationMotion} renderPage={(key) => <NotesGroupContent groupId={key} />} />
      <button className="floating-button" type="button" aria-label="新增笔记" onClick={() => setComposer(true)}><Plus /></button>
      {composer ? <div className="sheet-backdrop composer-backdrop" style={composerViewport ? { height: `${composerViewport.height}px`, top: `${composerViewport.offsetTop}px` } : undefined}><section className="composer-sheet" data-swipe-ignore="true"><header><strong>现在的想法是…</strong><button type="button" onClick={() => setComposer(false)}><X /></button></header><textarea wrap="soft" autoFocus value={content} onScroll={(event) => { event.currentTarget.scrollLeft = 0; }} onChange={(event) => setContent(event.target.value)} placeholder="写下一条短笔记" /><TagPicker tags={availableTags.data ?? []} value={tagIds} onChange={setTagIds} /><button type="button" className="primary-button" disabled={!content.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "保存中…" : "保存"}</button></section></div> : null}
      {manageGroups ? <GroupManager groups={groups.data ?? []} onClose={() => setManageGroups(false)} /> : null}
    </MobilePageFrame>
  );
}

function NotesGroupContent({ groupId }: { groupId: string }) {
  const navigate = useNavigate();
  const notes = useQuery({
    queryKey: ["notes", groupId],
    queryFn: () => mobileApi.notes({ limit: 30, offset: 0, status: "active", group_id: groupId === "all" ? undefined : Number(groupId) })
  });
  if (notes.isLoading) return <LoadingState />;
  if (notes.isError) return <ErrorState onRetry={() => void notes.refetch()} />;
  if (!notes.data?.items?.length) return <EmptyState title="这个分组还没有笔记" detail="记录一条现在的想法" />;
  return (
    <div className="note-list">
      {notes.data.items.map((note) => (
        <article className="note-card" key={note.id} onClick={() => navigate(`/notes/${note.id}`)}>
          <header>
            <div className="note-card-meta">
              <time>{formatDateTime(note.updated_at ?? note.created_at)}</time>
              {note.group ? <span className="note-card-group">{note.group.name}</span> : null}
            </div>
            <MoreHorizontal size={20} />
          </header>
          <p>{note.content}</p>
          {note.tags?.length ? <footer>{note.tags.map((tag) => <span className="note-card-tag" key={tag.id}>#{tag.name}</span>)}</footer> : null}
        </article>
      ))}
    </div>
  );
}

function GroupManager({ groups, onClose }: { groups: Awaited<ReturnType<typeof mobileApi.noteGroups>>; onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [archivePending, setArchivePending] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const activeGroups = useMemo(
    () => groups
      .filter((item) => item.status === "active")
      .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id),
    [groups]
  );
  const create = useMutation({
    mutationFn: () => mobileApi.createNoteGroup(
      name.trim(),
      activeGroups.reduce((maximum, group) => Math.max(maximum, group.sort_order), -1) + 1
    ),
    onSuccess: async () => {
      setName("");
      await client.invalidateQueries({ queryKey: ["note-groups"] });
    }
  });
  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) => mobileApi.reorderNoteGroups(orderedIds),
    onMutate: async (orderedIds) => {
      setReorderError(null);
      await client.cancelQueries({ queryKey: ["note-groups"] });
      const previous = client.getQueryData<typeof groups>(["note-groups"]);
      const byId = new Map((previous ?? []).map((group) => [group.id, group]));
      const reordered = orderedIds.map((id, sortOrder) => ({ ...byId.get(id)!, sort_order: sortOrder }));
      const inactive = (previous ?? []).filter((group) => group.status !== "active");
      client.setQueryData(["note-groups"], [...reordered, ...inactive]);
      return { previous };
    },
    onError: (_error, _orderedIds, context) => {
      if (context?.previous) client.setQueryData(["note-groups"], context.previous);
      setReorderError("分组排序保存失败，请重试");
    },
    onSuccess: (saved) => client.setQueryData(["note-groups"], saved)
  });
  const archive = async (group: typeof activeGroups[number]) => {
    setArchivePending(true);
    try {
      await mobileApi.updateNoteGroup({ ...group, status: "archived" });
      await client.invalidateQueries({ queryKey: ["note-groups"] });
    } finally {
      setArchivePending(false);
    }
  };
  const disabled = reorder.isPending || archivePending;
  return (
    <div className="sheet-backdrop">
      <section className="composer-sheet group-manager" data-swipe-ignore="true">
        <header><strong>笔记分组</strong><button type="button" aria-label="关闭分组编辑" onClick={onClose}><X /></button></header>
        <ReorderableNoteGroups
          groups={activeGroups}
          disabled={disabled}
          onReorder={(orderedIds) => reorder.mutateAsync(orderedIds).then(() => undefined)}
          onArchive={archive}
        />
        {reorderError ? <p className="group-manager__error" role="alert">{reorderError}</p> : null}
        <div className="group-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="新分组名称" /><button type="button" disabled={!name.trim() || create.isPending || disabled} onClick={() => create.mutate()}>添加</button></div>
      </section>
    </div>
  );
}
