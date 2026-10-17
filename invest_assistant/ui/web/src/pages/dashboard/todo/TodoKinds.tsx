import { Button, Form, Modal, Popconfirm, Select, Spin, message } from "antd";
import { useCallback, useMemo, useState } from "react";
import { deleteAlertEvent, listAlertEvents, markAlertRead } from "../../../api/alerts";
import { apiErrorDetail } from "../../../api/client";
import {
  archiveKnowledgeNote,
  deleteKnowledgeResearchFeedback,
  importKnowledgeResearchFeedback,
  listKnowledgeNoteGroups,
  listKnowledgeNotes,
  listKnowledgeResearchFeedback,
  updateKnowledgeNote,
  type KnowledgeNote,
  type KnowledgeResearchFeedback
} from "../../../api/knowledge";
import { listAiTagSuggestions, listMarketTags, rejectAiTagSuggestion } from "../../../api/marketRadar";
import { getReportContent } from "../../../api/reports";
import { MarkdownViewer } from "../../../components/common/MarkdownViewer";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { AiTagSuggestion } from "../../../types/api";
import { noteToPayload } from "../../knowledge/notePayload";
import { formatFeedbackImportSummary, hasImportFailure } from "../../knowledge/researchFeedbackImport";
import {
  SuggestionApproveFields,
  submitSuggestionApproval,
  suggestionApproveInitialValues,
  type SuggestionApproveValues
} from "../../market-radar/sections/SuggestionApproveFields";
import { TodoDetail, TodoPane, TodoSection } from "./TodoPane";
import { backlogAge, relativeTime, shortTime } from "./todoFormat";

const LIST_LIMIT = 50;

type KindProps = { onChanged: () => void };

function Dot() {
  return <span className="todo-meta-dot">·</span>;
}

/* ---------------- 推荐词 ---------------- */

export function SuggestionsTodo({ onChanged }: KindProps) {
  const load = useCallback(async () => (await listAiTagSuggestions("pending", { limit: LIST_LIMIT, offset: 0 })).items, []);
  return (
    <TodoPane<AiTagSuggestion>
      load={load}
      itemKey={(item) => item.id}
      emptyText="推荐词已全部审核"
      onChanged={onChanged}
      renderItem={(item) => ({
        title: item.suggested_text,
        meta: (
          <>
            {relativeTime(item.created_at)}
            {item.rejected_count ? (
              <>
                <Dot />
                被拒 {item.rejected_count} 次
              </>
            ) : null}
          </>
        ),
        aside: item.score == null ? null : <span className="todo-score">{Number(item.score).toFixed(1)}</span>
      })}
      renderDetail={(item, resolve) => <SuggestionDetail key={item.id} item={item} resolve={resolve} />}
    />
  );
}

function SuggestionDetail({ item, resolve }: { item: AiTagSuggestion; resolve: () => Promise<void> }) {
  const [form] = Form.useForm<SuggestionApproveValues>();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function approve() {
    setBusy("approve");
    try {
      await submitSuggestionApproval(item, form);
      message.success(`已通过「${item.suggested_text}」`);
      await resolve();
    } catch (error) {
      if ((error as { errorFields?: unknown })?.errorFields) return;
      message.error(apiErrorDetail(error, "通过失败"));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("reject");
    try {
      await rejectAiTagSuggestion(item.id);
      message.success(`已拒绝「${item.suggested_text}」`);
      await resolve();
    } catch (error) {
      message.error(apiErrorDetail(error, "拒绝失败"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <TodoDetail
      title={item.suggested_text}
      meta={
        <>
          AI 评分 {item.score == null ? "-" : Number(item.score).toFixed(1)}
          <Dot />
          {item.rejected_count ? `历史被拒 ${item.rejected_count} 次` : "首次推荐"}
          <Dot />
          {shortTime(item.created_at)}
        </>
      }
      actions={
        <>
          <Button danger loading={busy === "reject"} disabled={busy === "approve"} onClick={reject}>
            拒绝
          </Button>
          <Button type="primary" loading={busy === "approve"} disabled={busy === "reject"} onClick={approve}>
            通过
          </Button>
        </>
      }
    >
      <TodoSection label="推荐理由">
        <p className="todo-detail-text">{item.reason || "AI 未给出理由"}</p>
      </TodoSection>
      <TodoSection label="通过后绑定到">
        <Form form={form} layout="vertical" className="todo-form-grid" initialValues={suggestionApproveInitialValues(item)}>
          <SuggestionApproveFields form={form} compact />
        </Form>
      </TodoSection>
    </TodoDetail>
  );
}

/* ---------------- 报告 ---------------- */

export function ReportsTodo({ onChanged }: KindProps) {
  const load = useCallback(() => listKnowledgeResearchFeedback(true), []);
  return (
    <TodoPane<KnowledgeResearchFeedback>
      load={load}
      itemKey={(item) => item.id}
      emptyText="没有待导入的报告"
      onChanged={onChanged}
      renderItem={(item) => ({
        title: item.title,
        meta: (
          <>
            {item.researcher_code || item.source}
            <Dot />
            {relativeTime(item.returned_at || item.created_at)}
          </>
        )
      })}
      renderDetail={(item, resolve) => <ReportDetail key={item.id} item={item} resolve={resolve} />}
    />
  );
}

function ReportDetail({ item, resolve }: { item: KnowledgeResearchFeedback; resolve: () => Promise<void> }) {
  const content = useAsyncData(
    useCallback(async () => (item.report_id ? getReportContent(item.report_id) : ""), [item.report_id]),
    ""
  );
  const [busy, setBusy] = useState<"import" | "delete" | null>(null);

  async function importReport() {
    setBusy("import");
    try {
      const result = await importKnowledgeResearchFeedback(item.id);
      (hasImportFailure(result) ? message.warning : message.success)(formatFeedbackImportSummary(result));
      await resolve();
    } catch (error) {
      Modal.error({ title: "导入失败", content: apiErrorDetail(error, "未识别可导入的报告类型") });
    } finally {
      setBusy(null);
    }
  }

  async function removeReport() {
    setBusy("delete");
    try {
      await deleteKnowledgeResearchFeedback(item.id);
      message.success("已删除回流记录");
      await resolve();
    } catch (error) {
      message.error(apiErrorDetail(error, "删除失败"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <TodoDetail
      title={item.title}
      meta={
        <>
          {[item.researcher_code, item.skill_name, item.business_module].filter(Boolean).join(" / ") || item.source}
          <Dot />
          回流于 {shortTime(item.returned_at || item.created_at)}
        </>
      }
      actions={
        <>
          <Popconfirm title="删除这条研究回流？" description="仅删除回流记录，报告仍保留在报告库。" okText="删除" cancelText="取消" onConfirm={removeReport}>
            <Button danger loading={busy === "delete"} disabled={busy === "import"}>
              删除
            </Button>
          </Popconfirm>
          <Button type="primary" loading={busy === "import"} disabled={busy === "delete"} onClick={importReport}>
            导入
          </Button>
        </>
      }
    >
      <TodoSection label="报告正文">
        <div className="todo-report-body">
          {content.loading ? <Spin size="small" /> : content.error ? <span className="todo-muted">报告文件不存在或无法读取</span> : <MarkdownViewer content={content.data} />}
        </div>
      </TodoSection>
    </TodoDetail>
  );
}

/* ---------------- 笔记 ---------------- */

export function NotesTodo({ onChanged }: KindProps) {
  const groups = useAsyncData(useCallback(() => listKnowledgeNoteGroups("active"), []), []);
  const tags = useAsyncData(useCallback(() => listMarketTags(), []), []);
  const groupOptions = useMemo(() => groups.data.map((group) => ({ value: group.id, label: group.name })), [groups.data]);
  const tagOptions = useMemo(
    () => tags.data.filter((tag) => tag.status === "active").map((tag) => ({ value: tag.id, label: `#${tag.name}` })),
    [tags.data]
  );
  const load = useCallback(
    async () => (await listKnowledgeNotes({ status: "active", ungrouped: true, note_type: "mcp", limit: LIST_LIMIT, offset: 0 })).items,
    []
  );
  return (
    <TodoPane<KnowledgeNote>
      load={load}
      itemKey={(item) => item.id}
      emptyText="没有待整理的笔记"
      onChanged={onChanged}
      renderItem={(item) => ({
        title: item.title || "未命名笔记",
        meta: (
          <>
            {relativeTime(item.created_at)}
            {item.tags.length ? (
              <>
                <Dot />
                {item.tags.slice(0, 2).map((tag) => `#${tag.name}`).join(" ")}
              </>
            ) : null}
          </>
        )
      })}
      renderDetail={(item, resolve) => (
        <NoteDetail key={item.id} item={item} resolve={resolve} groupOptions={groupOptions} tagOptions={tagOptions} />
      )}
    />
  );
}

type Option = { value: number; label: string };

function NoteDetail({
  item,
  resolve,
  groupOptions,
  tagOptions
}: {
  item: KnowledgeNote;
  resolve: () => Promise<void>;
  groupOptions: Option[];
  tagOptions: Option[];
}) {
  const [form] = Form.useForm<{ group_id?: number; tag_ids: number[] }>();
  const groupId = Form.useWatch("group_id", form);
  const [busy, setBusy] = useState<"save" | "archive" | null>(null);

  async function save() {
    const values = await form.validateFields();
    setBusy("save");
    try {
      await updateKnowledgeNote(item.id, { ...noteToPayload(item), group_id: values.group_id ?? null, tag_ids: values.tag_ids || [] });
      message.success("笔记已归入分组");
      await resolve();
    } catch (error) {
      message.error(apiErrorDetail(error, "保存失败"));
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    setBusy("archive");
    try {
      await archiveKnowledgeNote(item.id);
      message.success("笔记已归档");
      await resolve();
    } catch (error) {
      message.error(apiErrorDetail(error, "归档失败"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <TodoDetail
      title={item.title || "未命名笔记"}
      meta={
        <>
          MCP 写入
          <Dot />
          {shortTime(item.created_at)}
        </>
      }
      actions={
        <>
          <Popconfirm title="归档这条笔记？" description="归档后不再出现在笔记列表，可在知识库恢复。" okText="归档" cancelText="取消" onConfirm={archive}>
            <Button loading={busy === "archive"} disabled={busy === "save"}>
              归档
            </Button>
          </Popconfirm>
          <Button type="primary" loading={busy === "save"} disabled={busy === "archive" || !groupId} onClick={save}>
            保存到分组
          </Button>
        </>
      }
    >
      <TodoSection label="正文">
        <p className="todo-detail-text todo-pre">{item.content}</p>
      </TodoSection>
      <TodoSection label="整理">
        <Form form={form} layout="vertical" className="todo-form-grid" initialValues={{ group_id: undefined, tag_ids: item.tags.map((tag) => tag.id) }}>
          <Form.Item name="group_id" label="分组" rules={[{ required: true, message: "请选择分组" }]}>
            <Select allowClear placeholder="选择分组" options={groupOptions} />
          </Form.Item>
          <Form.Item name="tag_ids" label="关联标签">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="搜索标签词" options={tagOptions} maxTagCount="responsive" />
          </Form.Item>
        </Form>
      </TodoSection>
    </TodoDetail>
  );
}

/* ---------------- 预警 ---------------- */

type AlertEventRow = {
  id: number;
  title: string;
  message: string;
  event_level: string;
  event_time?: string | null;
  created_at?: string | null;
};

const alertLevelLabels: Record<string, string> = { critical: "严重", high: "高", warning: "警告", medium: "中", info: "提示", low: "低" };

function AlertLevel({ level }: { level: string }) {
  const tone = ["critical", "high"].includes(level) ? "danger" : ["warning", "medium"].includes(level) ? "warning" : "info";
  return <span className={`todo-level ${tone}`}>{alertLevelLabels[level] || level}</span>;
}

export function AlertsTodo({ onChanged }: KindProps) {
  const load = useCallback(
    async () => (await listAlertEvents({ status: ["unread"], limit: LIST_LIMIT, offset: 0 })).items as unknown as AlertEventRow[],
    []
  );
  return (
    <TodoPane<AlertEventRow>
      load={load}
      itemKey={(item) => item.id}
      emptyText="没有未读预警"
      onChanged={onChanged}
      renderItem={(item) => ({
        title: item.title,
        meta: relativeTime(item.event_time || item.created_at),
        aside: <AlertLevel level={item.event_level} />
      })}
      renderDetail={(item, resolve) => <AlertDetail key={item.id} item={item} resolve={resolve} />}
    />
  );
}

function AlertDetail({ item, resolve }: { item: AlertEventRow; resolve: () => Promise<void> }) {
  const [busy, setBusy] = useState<"read" | "delete" | null>(null);

  async function run(kind: "read" | "delete") {
    setBusy(kind);
    try {
      if (kind === "read") await markAlertRead(item.id);
      else await deleteAlertEvent(item.id);
      message.success(kind === "read" ? "已标为已读" : "预警已删除");
      await resolve();
    } catch (error) {
      message.error(apiErrorDetail(error, "操作失败"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <TodoDetail
      title={item.title}
      meta={
        <>
          <AlertLevel level={item.event_level} />
          <Dot />
          {shortTime(item.event_time || item.created_at)}
          <Dot />
          已等待 {backlogAge(item.event_time || item.created_at)}
        </>
      }
      actions={
        <>
          <Popconfirm title="删除这条预警？" okText="删除" cancelText="取消" onConfirm={() => run("delete")}>
            <Button danger loading={busy === "delete"} disabled={busy === "read"}>
              删除
            </Button>
          </Popconfirm>
          <Button type="primary" loading={busy === "read"} disabled={busy === "delete"} onClick={() => run("read")}>
            标为已读
          </Button>
        </>
      }
    >
      <TodoSection label="预警内容">
        <p className="todo-detail-text todo-pre">{item.message}</p>
      </TodoSection>
    </TodoDetail>
  );
}
