import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Check, ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { GroupPicker } from "../components/GroupPicker";
import { MarkdownBody } from "../components/MarkdownBody";
import { TagPicker } from "../components/TagPicker";
import { ErrorState, LoadingState, SectionCard } from "../components/Ui";
import { nativeBridge, requestAppBack } from "../native/bridge";
import { formatDateTime, formatModule, plainMarkdownText } from "../utils/format";

export function DetailFrame({ title, action, className, children }: { title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, []);
  return <main className={className ? `detail-page ${className}` : "detail-page"}><header className="detail-header"><button type="button" aria-label="返回" onClick={requestAppBack}><ArrowLeft /></button><h1>{title}</h1>{action ?? <span />}</header><div className="detail-content">{children}</div></main>;
}

export function NewsDetailPage() {
  const id = Number(useParams().id);
  const query = useQuery({ queryKey: ["news-detail", id], queryFn: () => mobileApi.newsDetail(id) });
  if (query.isLoading) return <DetailFrame title="资讯详情"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) return <DetailFrame title="资讯详情"><ErrorState onRetry={() => void query.refetch()} /></DetailFrame>;
  const item = query.data;
  return <DetailFrame title="资讯详情"><article className="article-detail"><p className="article-source">{item.source_type === "sentiment" && item.author ? `${item.author} · ` : ""}{item.source_name} · {formatDateTime(item.publish_time)}</p>{item.source_type === "sentiment" ? null : <h2>{item.title}</h2>}<p>{item.content}</p>{item.source_tags?.length ? <div className="tag-row">{item.source_tags.map((tag) => <span key={tag.id}>#{tag.tag?.name}</span>)}</div> : null}{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">查看原文 <ExternalLink size={15} /></a> : null}</article></DetailFrame>;
}

export function NoteDetailPage() {
  const id = Number(useParams().id);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["note", id], queryFn: () => mobileApi.noteDetail(id) });
  const [content, setContent] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<number | null | undefined>(undefined);
  const [tagIds, setTagIds] = useState<number[] | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<"archive" | "delete" | "discard" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 保存、归档、删除成功或确认放弃后要离开页面，此时不再拦截返回 */
  const leavingRef = useRef(false);
  const groups = useQuery({ queryKey: ["note-groups"], queryFn: mobileApi.noteGroups });
  const availableTags = useQuery({ queryKey: ["tags"], queryFn: mobileApi.tags });
  /**
   * 笔记列表和待办的笔记收件箱此刻都已卸载，默认的 invalidate 只重拉挂着的查询，
   * 而全局 refetchOnMount 为 false，回到列表也不会补拉，看到的仍是旧列表。
   * 所以用 refetchType: "all" 让它们在后台立刻重拉。
   */
  const refreshNoteLists = () => Promise.all([
    client.invalidateQueries({ queryKey: ["notes"], refetchType: "all" }),
    client.invalidateQueries({ queryKey: ["inbox-notes"], refetchType: "all" }),
    client.invalidateQueries({ queryKey: ["note", id] })
  ]);
  const leavePage = async () => { leavingRef.current = true; await refreshNoteLists(); requestAppBack(); };
  const savedTagIds = query.data?.tags?.map((tag) => tag.id) ?? [];
  const currentContent = content ?? query.data?.content ?? "";
  const currentGroupId = groupId === undefined ? query.data?.group_id ?? null : groupId;
  const currentTagIds = tagIds ?? savedTagIds;
  const sameIds = (a: number[], b: number[]) => [...a].sort().join(",") === [...b].sort().join(",");
  const dirty = query.data !== undefined && (
    currentContent !== query.data.content || currentGroupId !== (query.data.group_id ?? null) || !sameIds(currentTagIds, savedTagIds)
  );
  const update = useMutation({
    mutationFn: () => mobileApi.updateNote(id, { content: currentContent, group_id: currentGroupId, tag_ids: currentTagIds }),
    onSuccess: leavePage
  });
  const archive = useMutation({ mutationFn: () => mobileApi.archiveNote(id), onSuccess: leavePage });
  const remove = useMutation({ mutationFn: () => mobileApi.deleteNote(id), onSuccess: leavePage });
  useLayoutEffect(() => {
    if (query.data && typeof textareaRef.current?.scrollTo === "function") textareaRef.current.scrollTo({ left: 0 });
  }, [query.data]);
  // 正文框随内容长高：打开就能看到全文，不在三行的小框里来回滚
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, [currentContent]);
  // 有未保存的修改时拦下返回：标题栏返回键和系统返回键都走 liuli:back，捕获阶段先于路由处理
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: Event) => {
      if (leavingRef.current) return;
      event.stopImmediatePropagation();
      setPendingAction("discard");
    };
    window.addEventListener("liuli:back", guard, { capture: true });
    return () => window.removeEventListener("liuli:back", guard, { capture: true });
  }, [dirty]);
  if (query.isLoading) return <DetailFrame title="编辑笔记"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) return <DetailFrame title="编辑笔记"><ErrorState onRetry={() => void query.refetch()} /></DetailFrame>;
  const note = query.data;
  const confirmCopy = {
    archive: { title: "确认归档笔记", text: "归档后，这条笔记将不再出现在当前笔记列表中。", cancel: "取消", confirm: "确认归档" },
    delete: { title: "确认删除笔记", text: "删除后，这条笔记将不再出现在笔记列表中。", cancel: "取消", confirm: "确认删除" },
    discard: { title: "放弃未保存的修改？", text: "返回后，这次的修改不会保存。", cancel: "继续编辑", confirm: "放弃修改" }
  };
  const confirmAction = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action === "archive") archive.mutate();
    else if (action === "delete") remove.mutate();
    else { leavingRef.current = true; requestAppBack(); }
  };
  const busy = archive.isPending || remove.isPending;
  const saveButton = (
    <button type="button" className="detail-header__action" aria-label="保存修改" disabled={!dirty || update.isPending || !currentContent.trim()} onClick={() => update.mutate()}>
      {update.isPending ? "保存中" : "保存"}
    </button>
  );
  return (
    <DetailFrame title="编辑笔记" action={saveButton}>
      <div className="note-editor">
        <textarea wrap="soft" ref={textareaRef} value={currentContent} onScroll={(event) => { event.currentTarget.scrollLeft = 0; }} onChange={(event) => setContent(event.target.value)} />
        {note.created_at ? (
          <p className="note-meta">创建于 {formatDateTime(note.created_at)}{note.updated_at && note.updated_at !== note.created_at ? ` · 更新于 ${formatDateTime(note.updated_at)}` : ""}</p>
        ) : null}
        <GroupPicker groups={groups.data ?? []} value={currentGroupId} onChange={setGroupId} />
        <TagPicker tags={availableTags.data ?? []} value={currentTagIds} onChange={setTagIds} />
        {update.isError ? <span className="form-error">保存失败，请重试</span> : null}
        {/* 归档是常用操作，保留整块按钮；删除低频且不可逆，降为底部小字 */}
        <div className="note-secondary-actions">
          <button type="button" className="note-archive-button" aria-label="归档笔记" disabled={busy} onClick={() => setPendingAction("archive")}><Archive size={17} />归档</button>
          <button type="button" className="note-delete-link" aria-label="删除笔记" disabled={busy} onClick={() => setPendingAction("delete")}><Trash2 size={14} />删除笔记</button>
        </div>
        {archive.isError || remove.isError ? <span className="form-error">操作失败，请重试</span> : null}
      </div>
      {pendingAction ? (
        <div className="sheet-backdrop" data-swipe-ignore="true">
          <section className="composer-sheet note-action-confirm" role="dialog" aria-modal="true" aria-labelledby="note-action-title">
            <header><strong id="note-action-title">{confirmCopy[pendingAction].title}</strong></header>
            <p>{confirmCopy[pendingAction].text}</p>
            <div className="note-action-confirm-buttons">
              <button type="button" onClick={() => setPendingAction(null)}>{confirmCopy[pendingAction].cancel}</button>
              <button type="button" className={pendingAction === "archive" ? "primary-button" : "danger-button"} onClick={confirmAction}>{confirmCopy[pendingAction].confirm}</button>
            </div>
          </section>
        </div>
      ) : null}
    </DetailFrame>
  );
}

export function AlertDetailPage() {
  const id = Number(useParams().id);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["alert-detail", id], queryFn: () => mobileApi.alertDetail(id) });
  // 列表只放未读：已读或已处理后连同未挂载的列表一起重拉再回去，回到列表时这条已经不在了。
  const leaveToList = async () => {
    await client.invalidateQueries({ queryKey: ["alerts"], refetchType: "all" });
    client.removeQueries({ queryKey: ["alert-detail", id] });
    requestAppBack();
  };
  const read = useMutation({ mutationFn: () => mobileApi.markAlertRead(id), onSuccess: leaveToList });
  const handle = useMutation({ mutationFn: () => mobileApi.handleAlert(id), onSuccess: leaveToList });
  if (query.isLoading) return <DetailFrame title="预警详情"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) return <DetailFrame title="预警详情"><ErrorState onRetry={() => void query.refetch()} /></DetailFrame>;
  return <DetailFrame title="预警详情"><div className="page-stack"><SectionCard><span className={`level-badge level-badge--${query.data.event_level}`}>{query.data.event_level}</span><h2>{query.data.title}</h2><p className="detail-message">{query.data.message}</p><time>{formatDateTime(query.data.event_time)}</time></SectionCard><div className="detail-actions">{query.data.status === "unread" ? <button onClick={() => read.mutate()}>标记已读</button> : null}{query.data.status !== "handled" ? <button className="primary-button" onClick={() => handle.mutate()}><Check size={17} />标记已处理</button> : <span className="handled-state"><Check size={17} />已处理</span>}</div></div></DetailFrame>;
}

export function ReportsPage() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["reports"], queryFn: () => mobileApi.reports(0, 50) });
  return <DetailFrame title="报告中心">{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : <div className="report-list">{query.data?.items.map((report) => <button key={report.id} onClick={() => navigate(`/reports/${report.id}`)}><span>{formatModule(report.source_module)}</span><strong>{report.title}</strong><p>{plainMarkdownText(report.summary)}</p><time>{formatDateTime(report.publish_time ?? report.created_at)}</time></button>)}</div>}</DetailFrame>;
}

export function ReportReaderPage() {
  const id = Number(useParams().id);
  const metadata = useQuery({ queryKey: ["report-detail", id], queryFn: () => mobileApi.reportDetail(id) });
  const content = useQuery({ queryKey: ["report-content", id], queryFn: () => mobileApi.reportContent(id) });
  if (metadata.isLoading || content.isLoading) return <DetailFrame title="报告"><LoadingState /></DetailFrame>;
  if (metadata.isError || content.isError) return <DetailFrame title="报告"><ErrorState onRetry={() => { void metadata.refetch(); void content.refetch(); }} /></DetailFrame>;
  return <DetailFrame title={metadata.data?.title ?? "报告"} className="report-reader"><MarkdownBody content={content.data ?? ""} /><button className="report-download" onClick={() => nativeBridge.openDownloadedFile(`/api/reports/${id}/content`, `${metadata.data?.title ?? "报告"}.md`)}>下载并打开</button></DetailFrame>;
}
