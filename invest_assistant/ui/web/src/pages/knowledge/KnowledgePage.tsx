import { DeleteOutlined, EditOutlined, FolderOutlined, PlusOutlined, ReloadOutlined, DownOutlined, UpOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, Modal, Popconfirm, Row, Col, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { UIEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { moduleTabs } from "../../app/navigation";
import {
  archiveKnowledgeNote,
  archiveKnowledgeNoteGroup,
  createKnowledgeExternalSkill,
  createKnowledgeNote,
  createKnowledgeNoteGroup,
  createKnowledgePrompt,
  createKnowledgeResearcher,
  deleteKnowledgeExternalSkill,
  deleteKnowledgeNote,
  deleteKnowledgePrompt,
  deleteKnowledgeResearcher,
  exportKnowledgeExternalSkill,
  listKnowledgeExternalSkills,
  listKnowledgeNoteGroups,
  listKnowledgeNotes,
  listKnowledgePrompts,
  listKnowledgeResearchers,
  listKnowledgeResearchFeedback,
  restoreKnowledgeNote,
  updateKnowledgeExternalSkill,
  updateKnowledgeNote,
  updateKnowledgeNoteGroup,
  updateKnowledgePrompt,
  updateKnowledgeResearcher
} from "../../api/knowledge";
import type {
  KnowledgeExternalSkill,
  KnowledgeExternalSkillPayload,
  KnowledgeNote,
  KnowledgeNoteGroup,
  KnowledgeNotePayload,
  KnowledgePrompt,
  KnowledgePromptPayload,
  KnowledgeResearchFeedback,
  KnowledgeResearcher,
  KnowledgeResearcherPayload
} from "../../api/knowledge";
import { listMarketTags } from "../../api/marketRadar";
import { DataPanel } from "../../components/common/DataPanel";
import { EmptyAction } from "../../components/common/EmptyAction";
import { MarkdownViewer } from "../../components/common/MarkdownViewer";
import { PageHeader } from "../../components/common/PageHeader";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { MarketTag } from "../../types/api";
import {
  KNOWLEDGE_NOTES_PAGE_SIZE,
  groupKnowledgeNotesByDate,
  mergeKnowledgeNotePage,
  refreshKnowledgeNoteQuery,
  shouldLoadNextKnowledgeNotePage
} from "./knowledgeNotesTimeline";

const noteTypeOptions = [
  { value: "review", label: "复盘" },
  { value: "principle", label: "投资原则" },
  { value: "mistake", label: "错误案例" },
  { value: "track", label: "赛道观察" },
  { value: "stock", label: "标的研究" },
  { value: "market", label: "市场观察" }
];


const promptDefaults: KnowledgePromptPayload = {
  prompt_key: "market_radar.extract_daily_hotwords_deepseek",
  title: "",
  target_task: "market_radar.extract_daily_hotwords_deepseek",
  provider: "deepseek",
  model: "deepseek-v4-flash",
  system_prompt: "",
  user_prompt: "",
  response_format: "json_object",
  status: "active"
};

const noteDefaults: KnowledgeNotePayload = {
  title: "",
  content: "",
  note_type: "",
  group_id: null,
  related_module: null,
  related_id: null,
  tags: null,
  tag_ids: [],
  status: "active"
};

type ExternalSkillFormValues = Pick<KnowledgeExternalSkillPayload, "name" | "version" | "content">;

const externalSkillDefaults: ExternalSkillFormValues = {
  name: "",
  version: "",
  content: ""
};

const researcherDefaults: KnowledgeResearcherPayload = {
  researcher_code: "",
  display_name: "",
  status: "active",
  intro: "",
  soul: "",
  method: ""
};

const compactPromptFormStyle = { marginBottom: 10 };

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "未注明日期";
}

function formatTime(value?: string | null) {
  return value ? value.slice(11, 16) : "--:--";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function getApiErrorDetail(error: unknown, fallback = "操作失败") {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}

function noteTypeLabel(value: string) {
  return noteTypeOptions.find((item) => item.value === value)?.label || value;
}

function deriveQuickNoteTitle(content: string) {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "未命名笔记";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}...` : firstLine;
}

function noteSaveErrorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
        return "";
      })
      .filter(Boolean)
      .join("；") || "请稍后重试";
  }
  return "请稍后重试";
}

function noteToPayload(note: KnowledgeNote): KnowledgeNotePayload {
  return {
    title: note.title,
    content: note.content,
    note_type: note.note_type,
    group_id: note.group_id ?? null,
    related_module: note.related_module ?? null,
    related_id: note.related_id ?? null,
    tags: note.tags_text ?? null,
    tag_ids: note.tags.map((tag) => tag.id),
    status: note.status
  };
}

function NotesSection() {
  const groups = useAsyncData(useCallback(() => listKnowledgeNoteGroups("active"), []), [] as KnowledgeNoteGroup[]);
  const tagData = useAsyncData(useCallback(() => listMarketTags(), []), [] as MarketTag[]);
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");
  const [groupFilter, setGroupFilter] = useState<number | undefined>();
  const [tagFilter, setTagFilter] = useState<number | undefined>();
  const [keyword, setKeyword] = useState("");
  const [editingNote, setEditingNote] = useState<KnowledgeNote | null>(null);
  const [noteDrawerOpen, setNoteDrawerOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<KnowledgeNoteGroup | null>(null);
  const [quickForm] = Form.useForm<KnowledgeNotePayload>();
  const [editForm] = Form.useForm<KnowledgeNotePayload>();
  const [groupForm] = Form.useForm<{ name: string; sort_order: number }>();
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [isEditingGroups, setIsEditingGroups] = useState(false);

  const activeTags = useMemo(() => tagData.data.filter((tag) => tag.status === "active"), [tagData.data]);
  const tagOptions = useMemo(() => activeTags.map((tag) => ({ value: tag.id, label: `#${tag.name}` })), [activeTags]);
  const groupOptions = useMemo(() => groups.data.map((group) => ({ value: group.id, label: group.name })), [groups.data]);
  const groupedNotes = useMemo(() => groupKnowledgeNotesByDate(notes), [notes]);

  const loadNotes = useCallback(async (offset: number, replace: boolean) => {
    if (replace) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const query = refreshKnowledgeNoteQuery({
        status: statusFilter,
        group_id: groupFilter,
        tag_id: tagFilter,
        q: keyword.trim() || undefined,
        limit: KNOWLEDGE_NOTES_PAGE_SIZE,
        offset
      });
      query.offset = offset;
      const page = await listKnowledgeNotes(query);
      setTotal(page.total);
      setHasMore(page.has_more);
      setNotes((current) => replace ? page.items : mergeKnowledgeNotePage(current, page.items));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [groupFilter, keyword, statusFilter, tagFilter]);

  useEffect(() => {
    void loadNotes(0, true);
  }, [loadNotes]);

  useEffect(() => {
    quickForm.setFieldsValue(noteDefaults);
  }, [quickForm]);

  useEffect(() => {
    quickForm.setFieldValue("group_id", groupFilter ?? null);
  }, [groupFilter, quickForm]);

  useEffect(() => {
    if (!noteDrawerOpen) return;
    editForm.setFieldsValue(editingNote ? noteToPayload(editingNote) : noteDefaults);
  }, [editForm, editingNote, noteDrawerOpen]);

  useEffect(() => {
    if (!groupModalOpen) return;
    groupForm.setFieldsValue({
      name: editingGroup?.name || "",
      sort_order: editingGroup?.sort_order ?? groups.data.length + 1
    });
  }, [editingGroup, groupForm, groupModalOpen, groups.data.length]);

  useEffect(() => {
    if (!isEditingGroups) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const sidebar = document.querySelector(".knowledge-notes-sidebar");
      if (sidebar && sidebar.contains(target)) {
        return;
      }
      const isPortal = target instanceof Element && !!target.closest?.(
        ".ant-popover, .ant-modal-root, .ant-select-dropdown, .ant-message"
      );
      if (isPortal) {
        return;
      }
      setIsEditingGroups(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isEditingGroups]);

  async function refreshFirstPage() {
    await loadNotes(0, true);
  }

  async function submitQuickNote() {
    const values = await quickForm.validateFields();
    const content = String(values.content || "").trim();
    if (!content) {
      message.warning("请输入笔记内容");
      return;
    }
    try {
      await createKnowledgeNote({ ...noteDefaults, ...values, content, title: deriveQuickNoteTitle(content), status: "active" });
      quickForm.resetFields();
      quickForm.setFieldsValue({ ...noteDefaults, group_id: groupFilter ?? null });
      message.success("笔记已保存");
      await refreshFirstPage();
    } catch (error) {
      message.error(`笔记保存失败：${noteSaveErrorMessage(error)}`);
    }
  }

  async function submitEditNote() {
    if (!editingNote) return;
    const values = await editForm.validateFields();
    try {
      await updateKnowledgeNote(editingNote.id, { ...noteToPayload(editingNote), ...values });
      setNoteDrawerOpen(false);
      setEditingNote(null);
      message.success("笔记已更新");
      await refreshFirstPage();
    } catch (error) {
      message.error(`笔记更新失败：${noteSaveErrorMessage(error)}`);
    }
  }

  async function archiveNote(note: KnowledgeNote) {
    await archiveKnowledgeNote(note.id);
    message.success("笔记已归档");
    await refreshFirstPage();
  }

  async function removeNote(note: KnowledgeNote) {
    await deleteKnowledgeNote(note.id);
    message.success("笔记已删除");
    await refreshFirstPage();
  }

  async function restoreNote(note: KnowledgeNote) {
    await restoreKnowledgeNote(note.id);
    message.success("笔记已恢复");
    await refreshFirstPage();
  }

  async function submitGroup() {
    const values = await groupForm.validateFields();
    if (editingGroup) {
      await updateKnowledgeNoteGroup(editingGroup.id, { ...editingGroup, ...values, sort_order: Number(values.sort_order || 0) });
      message.success("分组已更新");
    } else {
      await createKnowledgeNoteGroup({ name: values.name, sort_order: Number(values.sort_order || 0), status: "active" });
      message.success("分组已新增");
    }
    setGroupModalOpen(false);
    setEditingGroup(null);
    await groups.refresh();
  }

  async function softDeleteGroup(group: KnowledgeNoteGroup) {
    await archiveKnowledgeNoteGroup(group.id);
    if (groupFilter === group.id) setGroupFilter(undefined);
    message.success("分组已删除，笔记已移至未分组");
    await groups.refresh();
    await refreshFirstPage();
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (!shouldLoadNextKnowledgeNotePage(event.currentTarget, hasMore, loading || loadingMore)) return;
    void loadNotes(notes.length, false);
  }

  function openGroupModal(group: KnowledgeNoteGroup | null) {
    setEditingGroup(group);
    setGroupModalOpen(true);
  }

  return (
    <>
      <div className="knowledge-notes-layout">
        <aside className="knowledge-notes-sidebar">
          <div
            className="knowledge-panel-header"
            onClick={() => setGroupFilter(undefined)}
            style={{ cursor: "pointer" }}
          >
            <span>全部笔记</span>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingGroups(!isEditingGroups);
              }}
              style={{
                color: isEditingGroups ? "var(--ll-accent)" : "var(--ll-muted)",
                opacity: isEditingGroups ? 0.8 : 0.5,
                padding: "4px 8px",
                height: "auto",
              }}
              title={isEditingGroups ? "完成" : "编辑"}
            />
          </div>
          <div className="knowledge-sidebar-body">
            {groups.data.map((group) => (
              <div
                className={groupFilter === group.id ? "knowledge-group-row active" : "knowledge-group-row"}
                key={group.id}
                onClick={() => setGroupFilter(group.id)}
                style={{ cursor: "pointer" }}
              >
                <span className="group-name-text">{group.name}</span>
                {isEditingGroups && (
                  <Space size={2} onClick={(e) => e.stopPropagation()}>
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openGroupModal(group)} />
                    <Popconfirm
                      title="删除这个分组？"
                      description="这是软删除，分组内笔记会移动到未分组。"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => softDeleteGroup(group)}
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                )}
              </div>
            ))}
            {isEditingGroups && (
              <Button
                type="dashed"
                block
                size="small"
                icon={<PlusOutlined />}
                onClick={() => openGroupModal(null)}
                style={{ marginTop: "8px" }}
              >
                新增分组
              </Button>
            )}
          </div>
        </aside>

        <main className="knowledge-notes-main">
          <div className="knowledge-composer-header" onClick={() => setComposerExpanded(!composerExpanded)}>
            <div className="composer-header-title">
              <span style={{ color: "var(--ll-accent)", marginRight: "6px", fontWeight: "bold", fontSize: "14px" }}>
                {composerExpanded ? "−" : "+"}
              </span>
              <span>知识笔记</span>
              <span style={{ fontSize: "12px", color: "var(--ll-muted)", fontWeight: "normal", marginLeft: "6px" }}>
                ({total})
              </span>
            </div>
            <div className="composer-header-extra">
              {composerExpanded ? <UpOutlined /> : <DownOutlined />}
            </div>
          </div>
          {composerExpanded && (
            <Form form={quickForm} layout="vertical" className="knowledge-note-composer">
              <Form.Item name="content" className="knowledge-quick-content" rules={[{ required: true, message: "请输入笔记内容" }]}>
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="记录判断、证据、待验证点。正文首行会作为轻笔记主文本。" />
              </Form.Item>
              <div className="knowledge-quick-meta-row">

                <Form.Item name="group_id">
                  <Select allowClear placeholder="未分组" options={groupOptions} />
                </Form.Item>
                <Form.Item name="tag_ids">
                  <Select mode="multiple" allowClear showSearch placeholder="选择已有标签，展示为 #标签" options={tagOptions} optionFilterProp="label" />
                </Form.Item>
                <Button type="primary" onClick={submitQuickNote}>保存笔记</Button>
              </div>
            </Form>
          )}


          <div className="knowledge-notes-scroll" onScroll={handleScroll}>
            {groupedNotes.map((group) => (
              <section className="knowledge-date-group" key={group.date}>
                {group.items.map((note) => (
                  <article className="knowledge-note-row" key={note.id}>
                    <div className="knowledge-note-card">
                      <div className="knowledge-note-head-title" style={{ marginBottom: "6px" }}>
                        <Typography.Text type="secondary" style={{ fontSize: "12px" }}>
                          {formatDate(note.updated_at || note.created_at)} {formatTime(note.updated_at || note.created_at)}
                        </Typography.Text>
                      </div>
                      <p className="knowledge-note-content">{note.content}</p>
                      
                      <div className="knowledge-note-footer">
                        <div className="knowledge-note-meta">
                          {note.note_type ? (
                            <span className="meta-type-tag">{noteTypeLabel(note.note_type)}</span>
                          ) : null}
                          <span className="meta-group-tag">{note.group ? note.group.name : "未分组"}</span>
                          {note.tags.length ? (
                            note.tags.map((tag) => (
                              <span key={tag.id} className="meta-tag-link" onClick={() => setTagFilter(tag.id)}>
                                #{tag.name}
                              </span>
                            ))
                          ) : (
                            <span className="meta-no-tags">暂无标签</span>
                          )}
                        </div>
                        <div className="knowledge-note-actions">
                          <Space size={6}>
                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingNote(note); setNoteDrawerOpen(true); }} className="knowledge-note-action-btn">编辑</Button>
                            {note.status === "active" ? (
                              <Button type="text" size="small" icon={<FolderOutlined />} onClick={() => archiveNote(note)} className="knowledge-note-action-btn">归档</Button>
                            ) : null}
                            {note.status !== "active" ? (
                              <Button type="text" size="small" onClick={() => restoreNote(note)} className="knowledge-note-action-btn">恢复</Button>
                            ) : null}
                            <Popconfirm title="删除这条笔记？" description="删除后进入已删除，可恢复。" okText="删除" cancelText="取消" onConfirm={() => removeNote(note)}>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} className="knowledge-note-action-btn danger">删除</Button>
                            </Popconfirm>
                          </Space>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            ))}
            {!loading && notes.length === 0 ? <EmptyAction description="暂无知识笔记，可先记录一条复盘或原则" /> : null}
            {loadingMore ? <div className="knowledge-load-more">加载更多笔记...</div> : null}
            {!hasMore && notes.length > 0 ? <div className="knowledge-load-more">已加载全部笔记</div> : null}
          </div>
        </main>

        <aside className="knowledge-notes-filter">
          <div className="knowledge-panel-header">
            <span>筛选与整理</span>
          </div>
          <div className="knowledge-filter-body">
            <Input.Search
              allowClear
              placeholder="搜索标题或正文"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: "100%" }}
            />
            <Select allowClear placeholder="按标签筛选" value={tagFilter} options={tagOptions} onChange={setTagFilter} optionFilterProp="label" showSearch />
            <Select allowClear placeholder="按分组筛选" value={groupFilter} options={groupOptions} onChange={setGroupFilter} />
            <Row gutter={8}>
              <Col span={12}>
                <Button block onClick={() => { setTagFilter(undefined); setGroupFilter(undefined); setKeyword(""); setStatusFilter("active"); }}>重置筛选</Button>
              </Col>
              <Col span={12}>
                <Button block icon={<ReloadOutlined />} loading={loading} onClick={refreshFirstPage}>刷新</Button>
              </Col>
            </Row>
            <div className="knowledge-filter-hint">
              标签来自已有标签词表；这里不会自动创建新标签，也不会写入股票/赛道/热词绑定。
            </div>
          </div>
        </aside>
      </div>

      <Drawer
        title={
          <Space>
            <EditOutlined style={{ color: "var(--ll-accent)" }} />
            <span>编辑知识笔记</span>
          </Space>
        }
        width={620}
        open={noteDrawerOpen}
        onClose={() => setNoteDrawerOpen(false)}
        destroyOnClose
        closeIcon={false}
        extra={
          <Space size={8}>
            <Button onClick={() => setNoteDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitEditNote}>保存</Button>
          </Space>
        }
      >
        <Form form={editForm} layout="vertical" className="knowledge-drawer-form">
          <Row gutter={10}>
            <Col span={18}>
              <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                <Input placeholder="输入知识笔记的标题..." showCount maxLength={100} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="group_id" label="分组">
                <Select allowClear placeholder="未分组" options={groupOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="正文" rules={[{ required: true, message: "请输入正文" }]}>
            <Input.TextArea rows={8} placeholder="在这里写下你的研究结论、逻辑、证据或投资原则..." showCount maxLength={5000} />
          </Form.Item>
          <Form.Item name="tag_ids" label="关联标签">
            <Select mode="multiple" allowClear showSearch options={tagOptions} optionFilterProp="label" placeholder="选择或搜索关联标签词（可多选）" />
          </Form.Item>
          <div className="knowledge-drawer-hint">
            <InfoCircleOutlined style={{ color: "var(--ll-accent)", marginRight: 6 }} />
            <span>修改笔记将同步到该笔记在各赛道或标的回溯视图中的展示内容。</span>
          </div>
        </Form>
      </Drawer>

      <Modal title={editingGroup ? "编辑分组" : "新增分组"} open={groupModalOpen} onCancel={() => setGroupModalOpen(false)} onOk={submitGroup} destroyOnHidden>
        <Form form={groupForm} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: "请输入分组名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function PromptSection() {
  const prompts = useAsyncData(useCallback(listKnowledgePrompts, []), []);
  const [editing, setEditing] = useState<KnowledgePrompt | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<KnowledgePromptPayload>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(editing ? { ...editing } : promptDefaults);
  }, [editing, form, open]);

  async function submit() {
    const values = await form.validateFields();
    if (editing) {
      await updateKnowledgePrompt(editing.id, values);
      message.success("Prompt 已更新");
    } else {
      await createKnowledgePrompt(values);
      message.success("Prompt 已新增");
    }
    setOpen(false);
    await prompts.refresh();
  }

  async function remove(record: KnowledgePrompt) {
    await deleteKnowledgePrompt(record.id);
    message.success("Prompt 已删除");
    await prompts.refresh();
  }

  const promptColumns: ColumnsType<KnowledgePrompt> = [
    { title: "名称", dataIndex: "title" },
    { title: "Key", dataIndex: "prompt_key", ellipsis: true },
    { title: "适用任务", dataIndex: "target_task", ellipsis: true },
    { title: "模型", dataIndex: "model", width: 160 },
    { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag color={value === "active" ? "green" : "default"}>{String(value)}</Tag> },
    {
      title: "操作",
      width: 130,
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" onClick={() => { setEditing(record); setOpen(true); }}>编辑</Button>
          <Popconfirm title="删除这个 Prompt？" description={record.title} okText="删除" cancelText="取消" onConfirm={() => remove(record)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={() => { setEditing(null); setOpen(true); }}>新增 Prompt</Button>
          </>
        }
      >
        <Table rowKey="id" size="small" loading={prompts.loading} dataSource={prompts.data} columns={promptColumns} pagination={{ defaultPageSize: 10, showSizeChanger: true }} />
      </DataPanel>
      <Modal title={editing ? "编辑 Prompt" : "新增 Prompt"} width={980} style={{ top: 24 }} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="title" label="名称" style={compactPromptFormStyle} rules={[{ required: true, message: "请输入名称" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态" style={compactPromptFormStyle} rules={[{ required: true }]}>
                <Select options={[{ value: "active", label: "启用" }, { value: "disabled", label: "停用" }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="prompt_key" label="Key" style={compactPromptFormStyle} rules={[{ required: true, message: "请输入 Key" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="target_task" label="适用任务" style={compactPromptFormStyle} rules={[{ required: true, message: "请输入适用任务" }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="provider" label="服务商" style={compactPromptFormStyle} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="model" label="模型" style={compactPromptFormStyle} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="response_format" label="输出格式" style={compactPromptFormStyle} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="system_prompt" label="System Prompt" style={compactPromptFormStyle} rules={[{ required: true, message: "请输入 System Prompt" }]}>
            <Input.TextArea rows={6} />
          </Form.Item>
          <Form.Item name="user_prompt" label="User Prompt" rules={[{ required: true, message: "请输入 User Prompt" }]}>
            <Input.TextArea rows={12} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ExternalSkillsSection() {
  const skills = useAsyncData(useCallback(listKnowledgeExternalSkills, []), [] as KnowledgeExternalSkill[]);
  const [editing, setEditing] = useState<KnowledgeExternalSkill | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ExternalSkillFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      editing
        ? { name: editing.name, version: editing.version || "", content: editing.content || "" }
        : externalSkillDefaults
    );
  }, [editing, form, open]);

  async function submit() {
    const values = await form.validateFields();
    const payload: KnowledgeExternalSkillPayload = { ...values };
    if (editing) {
      await updateKnowledgeExternalSkill(editing.id, payload);
      message.success("Skill 已更新");
    } else {
      await createKnowledgeExternalSkill(payload);
      message.success("Skill 已新增");
    }
    setOpen(false);
    await skills.refresh();
  }

  async function remove(record: KnowledgeExternalSkill) {
    await deleteKnowledgeExternalSkill(record.id);
    message.success("Skill 已删除");
    await skills.refresh();
  }

  async function download(record: KnowledgeExternalSkill) {
    const blob = await exportKnowledgeExternalSkill(record.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = record.file_path.split("/").pop() || `${record.name}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const skillColumns: ColumnsType<KnowledgeExternalSkill> = [
    { title: "名称", dataIndex: "name", width: 180 },
    { title: "文件路径", dataIndex: "file_path", ellipsis: true },
    { title: "版本", dataIndex: "version", width: 100, render: (value) => value || "-" },
    { title: "最后更新时间", dataIndex: "updated_at", width: 160, render: formatDateTime },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" onClick={() => { setEditing(record); setOpen(true); }}>编辑</Button>
          <Button size="small" onClick={() => download(record)}>导出</Button>
          <Popconfirm title="删除这个 Skill？" description={record.name} okText="删除" cancelText="取消" onConfirm={() => remove(record)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => skills.refresh()}>刷新文件状态</Button>
            <Button size="small" type="primary" onClick={() => { setEditing(null); setOpen(true); }}>新增 Skill</Button>
          </>
        }
      >
        <Table rowKey="id" size="small" loading={skills.loading} dataSource={skills.data} columns={skillColumns} pagination={{ defaultPageSize: 10, showSizeChanger: true }} />
      </DataPanel>
      <Modal title={editing ? "编辑对外 Skill" : "新增对外 Skill"} width={920} style={{ top: 32 }} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={18}>
              <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="version" label="版本">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="Skill 文件正文" rules={[{ required: true, message: "请输入 Skill 文件正文" }]}>
            <Input.TextArea rows={18} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ResearcherSection() {
  const researchers = useAsyncData(useCallback(listKnowledgeResearchers, []), [] as KnowledgeResearcher[]);
  const [editingResearcher, setEditingResearcher] = useState<KnowledgeResearcher | null>(null);
  const [viewingResearcher, setViewingResearcher] = useState<KnowledgeResearcher | null>(null);
  const [researcherOpen, setResearcherOpen] = useState(false);
  const [researcherForm] = Form.useForm<KnowledgeResearcherPayload>();

  useEffect(() => {
    if (!researcherOpen) return;
    researcherForm.setFieldsValue(
      editingResearcher
        ? {
            researcher_code: editingResearcher.researcher_code,
            display_name: editingResearcher.display_name,
            status: editingResearcher.status,
            intro: editingResearcher.intro || "",
            soul: editingResearcher.soul || "",
            method: editingResearcher.method || ""
          }
        : researcherDefaults
    );
  }, [editingResearcher, researcherForm, researcherOpen]);

  async function submitResearcher() {
    const values = await researcherForm.validateFields();
    if (editingResearcher) {
      await updateKnowledgeResearcher(editingResearcher.id, values);
      message.success("研究员已更新");
    } else {
      await createKnowledgeResearcher(values);
      message.success("研究员已新增");
    }
    setResearcherOpen(false);
    await researchers.refresh();
  }

  async function removeResearcher(record: KnowledgeResearcher) {
    try {
      await deleteKnowledgeResearcher(record.id);
      message.success("研究员已删除");
      await researchers.refresh();
    } catch (error) {
      message.error(getApiErrorDetail(error, "研究员删除失败"));
    }
  }

  const researcherColumns: ColumnsType<KnowledgeResearcher> = [
    { title: "编号", dataIndex: "researcher_code", width: 130 },
    { title: "展示名称", dataIndex: "display_name", width: 180 },
    { title: "简介", dataIndex: "intro", width: 260, ellipsis: true, render: (value) => value || "-" },
    { title: "Profile 文件", dataIndex: "profile_path", ellipsis: true },
    { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag color={value === "active" ? "green" : "default"}>{String(value)}</Tag> },
    { title: "最后更新时间", dataIndex: "updated_at", width: 160, render: formatDateTime },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" onClick={() => setViewingResearcher(record)}>查看</Button>
          <Button size="small" onClick={() => { setEditingResearcher(record); setResearcherOpen(true); }}>编辑</Button>
          <Popconfirm title="删除这个研究员？" description={record.display_name} okText="删除" cancelText="取消" onConfirm={() => removeResearcher(record)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => researchers.refresh()}>刷新</Button>
            <Button size="small" type="primary" onClick={() => { setEditingResearcher(null); setResearcherOpen(true); }}>新增研究员</Button>
          </>
        }
      >
        <Table rowKey="id" size="small" loading={researchers.loading} dataSource={researchers.data} columns={researcherColumns} pagination={{ defaultPageSize: 8 }} scroll={{ x: 1130 }} />
      </DataPanel>
      {viewingResearcher && createPortal(
        <div className="full-screen-reader-overlay">
          <div className="full-screen-reader-close" onClick={() => setViewingResearcher(null)}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
          <div className="full-screen-reader-content">
            {viewingResearcher.profile_content ? (
              <MarkdownViewer content={viewingResearcher.profile_content} />
            ) : (
              <Typography.Text type="secondary">暂无内容</Typography.Text>
            )}
          </div>
        </div>,
        document.body
      )}
      <Modal title={editingResearcher ? "编辑研究员" : "新增研究员"} width={860} style={{ top: 36 }} open={researcherOpen} onCancel={() => setResearcherOpen(false)} onOk={submitResearcher} destroyOnHidden>
        <Form form={researcherForm} layout="vertical">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="researcher_code" label="编号" rules={[{ required: true, message: "请输入编号" }]}>
                <Input disabled={!!editingResearcher} placeholder="analyst_001" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="display_name" label="展示名称" rules={[{ required: true, message: "请输入展示名称" }]}>
                <Input placeholder="A股标的研究员" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
                <Select options={[{ value: "active", label: "启用" }, { value: "archived", label: "归档" }]} />
              </Form.Item>
            </Col>
          </Row>
          <Tabs
            items={[
              {
                key: "intro",
                label: "简介",
                children: (
                  <Form.Item name="intro" label="简介">
                    <Input.TextArea rows={12} placeholder="研究员定位、适用边界和使用说明" />
                  </Form.Item>
                )
              },
              {
                key: "soul",
                label: "价值观",
                children: (
                  <Form.Item name="soul" label="价值观">
                    <Input.TextArea rows={12} placeholder="世界观、长期偏好、禁区和研究人格" />
                  </Form.Item>
                )
              },
              {
                key: "method",
                label: "方法论",
                children: (
                  <Form.Item name="method" label="方法论">
                    <Input.TextArea rows={12} placeholder="分析框架、评分习惯、估值习惯和输出要求" />
                  </Form.Item>
                )
              }
            ]}
          />
        </Form>
      </Modal>
    </>
  );
}

function ResearchFeedbackSection() {
  const feedback = useAsyncData(useCallback(listKnowledgeResearchFeedback, []), [] as KnowledgeResearchFeedback[]);
  const skills = useAsyncData(useCallback(listKnowledgeExternalSkills, []), [] as KnowledgeExternalSkill[]);
  const researchers = useAsyncData(useCallback(listKnowledgeResearchers, []), [] as KnowledgeResearcher[]);
  const [viewing, setViewing] = useState<KnowledgeResearchFeedback | null>(null);
  const skillById = useMemo(() => new Map(skills.data.map((item) => [item.id, item.name])), [skills.data]);
  const researcherById = useMemo(() => new Map(researchers.data.map((item) => [item.id, item.display_name])), [researchers.data]);

  const feedbackColumns: ColumnsType<KnowledgeResearchFeedback> = [
    { title: "报告", dataIndex: "title", ellipsis: true },
    { title: "研究时间", dataIndex: "research_time", width: 150, render: formatDateTime },
    { title: "回流时间", dataIndex: "returned_at", width: 150, render: formatDateTime },
    { title: "使用 Skill", dataIndex: "external_skill_id", width: 150, render: (value) => value ? skillById.get(Number(value)) || "-" : "-" },
    { title: "研究员", dataIndex: "researcher_id", width: 140, render: (value) => value ? researcherById.get(Number(value)) || "-" : "-" },
    { title: "验证结果", dataIndex: "verification_result", width: 140, render: (value) => value || "待验证" },
    { title: "更新时间", dataIndex: "updated_at", width: 150, render: formatDateTime },
    { title: "操作", width: 80, render: (_, record) => <Button size="small" onClick={() => setViewing(record)}>查看</Button> }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => feedback.refresh()}>刷新 MCP 回流</Button>
          </>
        }
      >
        <Table rowKey="id" size="small" loading={feedback.loading} dataSource={feedback.data} columns={feedbackColumns} pagination={{ defaultPageSize: 10, showSizeChanger: true }} />
      </DataPanel>
      <Modal title={viewing?.title || "研究回流详情"} width={980} style={{ top: 24 }} open={!!viewing} onCancel={() => setViewing(null)} footer={null} destroyOnHidden>
        {viewing ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Text type="secondary">研究时间：{formatDateTime(viewing.research_time)}　回流时间：{formatDateTime(viewing.returned_at)}　更新时间：{formatDateTime(viewing.updated_at)}</Typography.Text>
            <Typography.Title level={5}>结构化结论</Typography.Title>
            <Input.TextArea readOnly rows={4} value={viewing.structured_conclusion || ""} />
            <Typography.Title level={5}>估值假设</Typography.Title>
            <Input.TextArea readOnly rows={3} value={viewing.valuation_assumption || ""} />
            <Typography.Title level={5}>风险点 / 观察信号</Typography.Title>
            <Input.TextArea readOnly rows={4} value={[viewing.risk_points, viewing.observation_signals].filter(Boolean).join("\n\n")} />
            <Typography.Title level={5}>研究报告</Typography.Title>
            <Input.TextArea readOnly rows={10} value={viewing.report_content || viewing.report_path || ""} />
          </Space>
        ) : null}
      </Modal>
    </>
  );
}

export function KnowledgePage() {
  const [activeTab, setActiveTab] = useState("notes");

  function content() {
    if (activeTab === "prompts") return <PromptSection />;
    if (activeTab === "external-skills") return <ExternalSkillsSection />;
    if (activeTab === "researchers") return <ResearcherSection />;
    if (activeTab === "research-feedback") return <ResearchFeedbackSection />;
    return <NotesSection />;
  }

  return (
    <>
      <PageHeader title="知识库" description="笔记 · Prompt · Skills · 回流" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.knowledge} onChange={setActiveTab} />
      {content()}
    </>
  );
}
