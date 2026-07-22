import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Check, ExternalLink, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { MarkdownBody } from "../components/MarkdownBody";
import { ErrorState, LoadingState, SectionCard } from "../components/Ui";
import { nativeBridge, requestAppBack } from "../native/bridge";
import { formatDateTime } from "../utils/format";

export function DetailFrame({ title, children }: { title: string; children: React.ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, []);
  return <main className="detail-page"><header className="detail-header"><button type="button" aria-label="返回" onClick={requestAppBack}><ArrowLeft /></button><h1>{title}</h1><span /></header><div className="detail-content">{children}</div></main>;
}

export function NewsDetailPage() {
  const id = Number(useParams().id);
  const query = useQuery({ queryKey: ["news-detail", id], queryFn: () => mobileApi.newsDetail(id) });
  if (query.isLoading) return <DetailFrame title="资讯详情"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) return <DetailFrame title="资讯详情"><ErrorState onRetry={() => void query.refetch()} /></DetailFrame>;
  const item = query.data;
  return <DetailFrame title="资讯详情"><article className="article-detail"><p className="article-source">{item.source_name} · {formatDateTime(item.publish_time)}</p><h2>{item.title}</h2><p>{item.content}</p>{item.source_tags?.length ? <div className="tag-row">{item.source_tags.map((tag) => <span key={tag.id}>#{tag.tag?.name}</span>)}</div> : null}{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">查看原文 <ExternalLink size={15} /></a> : null}</article></DetailFrame>;
}

export function NoteDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["note", id], queryFn: () => mobileApi.noteDetail(id) });
  const [content, setContent] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<number | null | undefined>(undefined);
  const [tagsText, setTagsText] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<"archive" | "delete" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const groups = useQuery({ queryKey: ["note-groups"], queryFn: mobileApi.noteGroups });
  const update = useMutation({
    mutationFn: () => mobileApi.updateNote(id, { content: content ?? query.data?.content ?? "", group_id: groupId === undefined ? query.data?.group_id : groupId, tags: (tagsText ?? noteTagsText(query.data)).trim() || null }),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["notes"] }), client.invalidateQueries({ queryKey: ["note", id] })]); requestAppBack(); }
  });
  const archive = useMutation({
    mutationFn: () => mobileApi.archiveNote(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["notes"] }),
        client.invalidateQueries({ queryKey: ["note", id] })
      ]);
      navigate("/notes", { replace: true });
    }
  });
  const remove = useMutation({
    mutationFn: () => mobileApi.deleteNote(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["notes"] }),
        client.invalidateQueries({ queryKey: ["note", id] })
      ]);
      navigate("/notes", { replace: true });
    }
  });
  useLayoutEffect(() => {
    if (query.data && typeof textareaRef.current?.scrollTo === "function") textareaRef.current.scrollTo({ left: 0 });
  }, [query.data]);
  if (query.isLoading) return <DetailFrame title="编辑笔记"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) return <DetailFrame title="编辑笔记"><ErrorState onRetry={() => void query.refetch()} /></DetailFrame>;
  return <DetailFrame title="编辑笔记"><div className="note-editor"><textarea wrap="soft" ref={textareaRef} value={content ?? query.data.content} onScroll={(event) => { event.currentTarget.scrollLeft = 0; }} onChange={(event) => setContent(event.target.value)} /><label>分组<select value={String(groupId === undefined ? query.data.group_id ?? "" : groupId ?? "")} onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : null)}><option value="">未分组</option>{groups.data?.filter((item) => item.status === "active").map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><label>标签<input value={tagsText ?? noteTagsText(query.data)} onChange={(event) => setTagsText(event.target.value)} placeholder="标签，用逗号分隔" /></label><button className="primary-button" disabled={update.isPending || !(content ?? query.data.content).trim()} onClick={() => update.mutate()}>{update.isPending ? "保存中…" : "保存修改"}</button><div className="note-danger-actions"><button type="button" aria-label="归档笔记" disabled={archive.isPending || remove.isPending} onClick={() => setPendingAction("archive")}><Archive size={17} />归档</button><button type="button" aria-label="删除笔记" className="danger-text" disabled={archive.isPending || remove.isPending} onClick={() => setPendingAction("delete")}><Trash2 size={17} />删除</button></div>{archive.isError || remove.isError ? <span className="form-error">操作失败，请重试</span> : null}</div>{pendingAction ? <div className="sheet-backdrop" data-swipe-ignore="true"><section className="composer-sheet note-action-confirm" role="dialog" aria-modal="true" aria-labelledby="note-action-title"><header><strong id="note-action-title">{pendingAction === "archive" ? "确认归档笔记" : "确认删除笔记"}</strong></header><p>{pendingAction === "archive" ? "归档后，这条笔记将不再出现在当前笔记列表中。" : "删除后，这条笔记将不再出现在笔记列表中。"}</p><div className="note-action-confirm-buttons"><button type="button" onClick={() => setPendingAction(null)}>取消</button><button type="button" className={pendingAction === "delete" ? "danger-button" : "primary-button"} onClick={() => { const action = pendingAction; setPendingAction(null); if (action === "archive") archive.mutate(); else remove.mutate(); }}>{pendingAction === "archive" ? "确认归档" : "确认删除"}</button></div></section></div> : null}</DetailFrame>;
}

function noteTagsText(note: { tags_text?: string | null; tags?: Array<{ name: string }> } | null | undefined) {
  return note?.tags_text ?? note?.tags?.map((tag) => tag.name).join(", ") ?? "";
}

export function AlertDetailPage() {
  const id = Number(useParams().id);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["alert-detail", id], queryFn: () => mobileApi.alertDetail(id) });
  const read = useMutation({ mutationFn: () => mobileApi.markAlertRead(id), onSuccess: async () => { await query.refetch(); await client.invalidateQueries({ queryKey: ["alerts"] }); } });
  const handle = useMutation({ mutationFn: () => mobileApi.handleAlert(id), onSuccess: async () => { await query.refetch(); await client.invalidateQueries({ queryKey: ["alerts"] }); } });
  if (query.isLoading) return <DetailFrame title="预警详情"><LoadingState /></DetailFrame>;
  if (query.isError || !query.data) return <DetailFrame title="预警详情"><ErrorState onRetry={() => void query.refetch()} /></DetailFrame>;
  return <DetailFrame title="预警详情"><div className="page-stack"><SectionCard><span className={`level-badge level-badge--${query.data.event_level}`}>{query.data.event_level}</span><h2>{query.data.title}</h2><p className="detail-message">{query.data.message}</p><time>{formatDateTime(query.data.event_time)}</time></SectionCard><div className="detail-actions">{query.data.status === "unread" ? <button onClick={() => read.mutate()}>标记已读</button> : null}{query.data.status !== "handled" ? <button className="primary-button" onClick={() => handle.mutate()}><Check size={17} />标记已处理</button> : <span className="handled-state"><Check size={17} />已处理</span>}</div></div></DetailFrame>;
}

export function ReportsPage() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["reports"], queryFn: () => mobileApi.reports(0, 50) });
  return <DetailFrame title="报告中心">{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : <div className="report-list">{query.data?.items.map((report) => <button key={report.id} onClick={() => navigate(`/reports/${report.id}`)}><span>{report.source_module}</span><strong>{report.title}</strong><p>{report.summary}</p><time>{formatDateTime(report.publish_time ?? report.created_at)}</time></button>)}</div>}</DetailFrame>;
}

export function ReportReaderPage() {
  const id = Number(useParams().id);
  const metadata = useQuery({ queryKey: ["report-detail", id], queryFn: () => mobileApi.reportDetail(id) });
  const content = useQuery({ queryKey: ["report-content", id], queryFn: () => mobileApi.reportContent(id) });
  if (metadata.isLoading || content.isLoading) return <DetailFrame title="报告"><LoadingState /></DetailFrame>;
  if (metadata.isError || content.isError) return <DetailFrame title="报告"><ErrorState onRetry={() => { void metadata.refetch(); void content.refetch(); }} /></DetailFrame>;
  return <DetailFrame title={metadata.data?.title ?? "报告"}><MarkdownBody content={content.data ?? ""} /><button className="report-download" onClick={() => nativeBridge.openDownloadedFile(`/api/reports/${id}/content`, `${metadata.data?.title ?? "报告"}.md`)}>下载并打开</button></DetailFrame>;
}
