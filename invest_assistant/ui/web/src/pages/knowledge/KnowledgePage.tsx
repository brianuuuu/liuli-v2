import { Button, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { moduleTabs } from "../../app/navigation";
import {
  createKnowledgePrompt,
  deleteKnowledgePrompt,
  listKnowledgeAgents,
  listKnowledgeFeedbackLogs,
  listKnowledgeNotes,
  listKnowledgePrompts,
  listKnowledgeSkills,
  updateKnowledgePrompt
} from "../../api/knowledge";
import type { KnowledgePrompt, KnowledgePromptPayload } from "../../api/knowledge";
import { DataPanel } from "../../components/common/DataPanel";
import { PageHeader } from "../../components/common/PageHeader";
import { RecordTable } from "../../components/common/RecordTable";
import { ModuleTabs } from "../../components/layout/ModuleTabs";
import { useAsyncData } from "../../hooks/useAsyncData";

const columns = [
  { title: "标题", dataIndex: "title" },
  { title: "名称", dataIndex: "name" },
  { title: "类型", dataIndex: "note_type" },
  { title: "状态", dataIndex: "status" }
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

const compactPromptFormStyle = { marginBottom: 10 };

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
        <Table rowKey="id" size="small" loading={prompts.loading} dataSource={prompts.data} columns={promptColumns} pagination={{ pageSize: 10, showSizeChanger: true }} />
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
  const notes = useAsyncData(useCallback(listKnowledgeNotes, []), []);
  const skills = useAsyncData(useCallback(listKnowledgeSkills, []), []);
  const agents = useAsyncData(useCallback(listKnowledgeAgents, []), []);
  const feedback = useAsyncData(useCallback(listKnowledgeFeedbackLogs, []), []);

  function content() {
    if (activeTab === "prompts") return <PromptSection />;
    if (activeTab === "skills") return <RecordTable loading={skills.loading} data={skills.data} columns={columns} emptyText="暂无 Skills" drawerTitle="Skill 详情" />;
    if (activeTab === "agents") return <RecordTable loading={agents.loading} data={agents.data} columns={columns} emptyText="暂无 Agents" drawerTitle="Agent 详情" />;
    if (activeTab === "feedback") return <RecordTable loading={feedback.loading} data={feedback.data} columns={columns} emptyText="暂无反馈日志" drawerTitle="反馈详情" />;
    return <RecordTable loading={notes.loading} data={notes.data} columns={columns} emptyText="暂无知识笔记" drawerTitle="笔记详情" />;
  }

  return (
    <>
      <PageHeader title="知识库" description="笔记 / Skills / Agents" />
      <ModuleTabs activeKey={activeTab} items={moduleTabs.knowledge} onChange={setActiveTab} />
      {content()}
    </>
  );
}
