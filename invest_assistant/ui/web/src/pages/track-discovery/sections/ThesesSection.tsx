import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { changeTrackStatus, createTrack, deleteTrack, listTracks, updateTrack } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { Track } from "../../../types/api";
import { confidenceOptions, formatTime, stageOptions, StatusTag, thesisStatusOptions } from "./shared";

type TrackFormValues = {
  name: string;
  description?: string;
  status: string;
};

export function TracksSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [editing, setEditing] = useState<Track | null>(null);
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<Track | null>(null);
  const [form] = Form.useForm<TrackFormValues>();
  const [statusForm] = Form.useForm<{ new_status: string; reason?: string }>();
  const statusButtons = [{ value: undefined, label: "全部" }, ...thesisStatusOptions];

  const rows = useMemo(
    () => tracks.data.filter((item) => !statusFilter || item.status === statusFilter),
    [tracks.data, statusFilter]
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        description: editing.description || undefined,
        status: editing.status
      });
    } else {
      form.setFieldsValue({ status: "candidate" });
    }
  }, [editing, form, open]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(record: Track) {
    setEditing(record);
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      description: values.description || null,
      status: values.status,
      track_score: null,
      current_view: null,
      stage: null,
      confidence_level: null
    };
    if (editing) {
      await updateTrack(editing.id, payload);
      message.success("赛道已更新");
    } else {
      await createTrack(payload);
      message.success("赛道已创建");
    }
    setOpen(false);
    await tracks.refresh();
  }

  function openStatus(record: Track) {
    setStatusOpen(record);
    statusForm.setFieldsValue({ new_status: record.status });
  }

  async function submitStatus() {
    if (!statusOpen) return;
    const values = await statusForm.validateFields();
    await changeTrackStatus(statusOpen.id, values.new_status, values.reason || null);
    message.success("状态已变更");
    setStatusOpen(null);
    await tracks.refresh();
  }

  async function archive(record: Track) {
    await changeTrackStatus(record.id, "archived", "archive from web");
    message.success("赛道已归档");
    await tracks.refresh();
  }

  async function remove(record: Track) {
    try {
      await deleteTrack(record.id);
      message.success("候选赛道已删除");
      await tracks.refresh();
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      message.error(detail || "候选赛道删除失败");
    }
  }

  const columns: ColumnsType<Track> = [
    { title: "赛道", dataIndex: "name", render: (value, record) => <Link className="track-name-link" to={`/track-discovery/tracks/${record.id}`}>{value}</Link> },
    { title: "状态", dataIndex: "status", width: 110, render: (value) => <StatusTag status={value} /> },
    { title: "阶段", dataIndex: "stage", width: 100, render: (value) => stageOptions.find((item) => item.value === value)?.label || value || "-" },
    { title: "评分", dataIndex: "track_score", width: 80, render: (value) => value ?? "-" },
    { title: "置信", dataIndex: "confidence_level", width: 90, render: (value) => value || "-" },
    { title: "当前判断", dataIndex: "current_view", ellipsis: true, render: (value) => value || "-" },
    { title: "Tag ID", dataIndex: ["tag", "id"], width: 90, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 230,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => openStatus(record)}>状态</Button>
          {record.status === "candidate" ? (
            <Popconfirm title="物理删除这个候选赛道？" okText="删除" cancelText="取消" onConfirm={() => remove(record)}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="归档这个赛道？" okText="归档" cancelText="取消" onConfirm={() => archive(record)}>
              <Button size="small" danger disabled={record.status === "archived"}>归档</Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <Space size={4} className="toolbar-status-buttons">
              {statusButtons.map((item) => (
                <Button
                  key={item.value || "all"}
                  size="small"
                  className={statusFilter === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                  onClick={() => setStatusFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" type="primary" onClick={openCreate}>新增赛道</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={tracks.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无已跟踪赛道" /> }}
        />
      </DataPanel>

      <Modal title={editing ? "编辑赛道" : "新增赛道"} open={open} onCancel={() => { setOpen(false); setEditing(null); }} onOk={submit} destroyOnHidden forceRender width={480}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="赛道名称" rules={[{ required: true, message: "请输入赛道名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={thesisStatusOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="变更状态" open={Boolean(statusOpen)} onCancel={() => setStatusOpen(null)} onOk={submitStatus} destroyOnHidden>
        <Form form={statusForm} layout="vertical" preserve={false}>
          <Form.Item name="new_status" label="新状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={thesisStatusOptions} />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
