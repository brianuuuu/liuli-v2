import { DeleteOutlined, EditOutlined, FolderOutlined, PlusOutlined, ReloadOutlined, DownOutlined, UpOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, Modal, Popconfirm, Row, Col, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { UIEvent, useCallback, useEffect, useMemo, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import {
  archiveKnowledgeNote,
  archiveKnowledgeNoteGroup,
  createKnowledgeNote,
  createKnowledgeNoteGroup,
  createKnowledgePrompt,
  deleteKnowledgeNote,
  deleteKnowledgePrompt,
  listKnowledgeAgents,
  listKnowledgeFeedbackLogs,
  listKnowledgeNoteGroups,
  listKnowledgeNotes,
  listKnowledgePrompts,
  listKnowledgeSkills,
  restoreKnowledgeNote,
  updateKnowledgeNote,
  updateKnowledgeNoteGroup,
  updateKnowledgePrompt
} from "../../api/knowledge";
import type { KnowledgeNote, KnowledgeNoteGroup, KnowledgeNotePayload, KnowledgePrompt, KnowledgePromptPayload } from "../../api/knowledge";
import { listMarketTags } from "../../api/marketRadar";
import { DataPanel } from "../../components/common/DataPanel";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
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

const columns = [
  { title: "标题", dataIndex: "title" },
  { title: "名称", dataIndex: "name" },
  { title: "类型", dataIndex: "note_type" },
  { title: "状态", dataIndex: "status" }
];

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

const compactPromptFormStyle = { marginBottom: 10 };

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "未注明日期";
}

function formatTime(value?: string | null) {
  return value ? value.slice(11, 16) : "--:--";
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

export function KnowledgePage() {
  const [activeTab, setActiveTab] = useState("notes");
  const skills = useAsyncData(useCallback(listKnowledgeSkills, []), []);
  const agents = useAsyncData(useCallback(listKnowledgeAgents, []), []);
  const feedback = useAsyncData(useCallback(listKnowledgeFeedbackLogs, []), []);

  function content() {
    if (activeTab === "prompts") return <PromptSection />;
    if (activeTab === "skills") return <RecordTable loading={skills.loading} data={skills.data} columns={columns} emptyText="暂无 Skills" drawerTitle="Skill 详情" />;
    if (activeTab === "agents") return <RecordTable loading={agents.loading} data={agents.data} columns={columns} emptyText="暂无 Agents" drawerTitle="Agent 详情" />;
    if (activeTab === "feedback") return <RecordTable loading={feedback.loading} data={feedback.data} columns={columns} emptyText="暂无反馈日志" drawerTitle="反馈详情" />;
    return <NotesSection />;
  }

  return (
    <>
      <PageHeader title="知识库" description="笔记 / Skills / Agents" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.knowledge} onChange={setActiveTab} />
      {content()}
    </>
  );
}
