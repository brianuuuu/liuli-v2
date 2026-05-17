import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { archiveTrackThesis, changeTrackStatus, createTrackThesis, listTrackTheses, updateTrackThesis } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TrackThesis } from "../../../types/api";
import { formatTime, StatusTag, thesisStatusOptions } from "./shared";
import { ThesisForm, type ThesisFormValues } from "./ThesisForm";

export function ThesesSection() {
  const theses = useAsyncData(useCallback(listTrackTheses, []), []);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [editing, setEditing] = useState<TrackThesis | null>(null);
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<TrackThesis | null>(null);
  const [form] = Form.useForm<ThesisFormValues>();
  const [statusForm] = Form.useForm<{ new_status: string; reason?: string }>();

  const rows = useMemo(
    () => theses.data.filter((item) => !statusFilter || item.status === statusFilter),
    [theses.data, statusFilter]
  );

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ status: "watching", confidence_level: "medium" });
    setOpen(true);
  }

  function openEdit(record: TrackThesis) {
    setEditing(record);
    form.setFieldsValue({
      title: record.title,
      core_thesis: record.core_thesis,
      underlying_change: record.underlying_change || undefined,
      old_bottleneck: record.old_bottleneck || undefined,
      new_solution: record.new_solution || undefined,
      value_chain_shift: record.value_chain_shift || undefined,
      time_horizon: record.time_horizon || undefined,
      confidence_level: record.confidence_level || undefined,
      status: record.status
    });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    const payload = {
      ...values,
      underlying_change: values.underlying_change || null,
      old_bottleneck: values.old_bottleneck || null,
      new_solution: values.new_solution || null,
      value_chain_shift: values.value_chain_shift || null,
      time_horizon: values.time_horizon || null,
      confidence_level: values.confidence_level || null
    };
    if (editing) {
      await updateTrackThesis(editing.id, payload);
      message.success("赛道已更新");
    } else {
      await createTrackThesis(payload);
      message.success("赛道已创建");
    }
    setOpen(false);
    await theses.refresh();
  }

  function openStatus(record: TrackThesis) {
    setStatusOpen(record);
    statusForm.setFieldsValue({ new_status: record.status });
  }

  async function submitStatus() {
    if (!statusOpen) return;
    const values = await statusForm.validateFields();
    await changeTrackStatus(statusOpen.id, values.new_status, values.reason || null);
    message.success("状态已变更");
    setStatusOpen(null);
    await theses.refresh();
  }

  async function archive(record: TrackThesis) {
    await archiveTrackThesis(record.id);
    message.success("赛道已归档");
    await theses.refresh();
  }

  const columns: ColumnsType<TrackThesis> = [
    { title: "赛道", dataIndex: "title", render: (value, record) => <Link to={`/track-discovery/theses/${record.id}`}>{value}</Link> },
    { title: "状态", dataIndex: "status", width: 110, render: (value) => <StatusTag status={value} /> },
    { title: "置信度", dataIndex: "confidence_level", width: 100, render: (value) => value || "-" },
    { title: "时间维度", dataIndex: "time_horizon", width: 100, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 230,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" onClick={() => openStatus(record)}>状态</Button>
          <Popconfirm title="归档这个赛道？" onConfirm={() => archive(record)}>
            <Button size="small" danger disabled={record.status === "archived"}>归档</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <WorkbenchCard
        title="赛道列表"
        extra={
          <Space>
            <Select allowClear size="small" placeholder="状态" value={statusFilter} options={thesisStatusOptions} style={{ width: 120 }} onChange={setStatusFilter} />
            <Button size="small" type="primary" onClick={openCreate}>新增赛道</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={theses.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无已跟踪赛道" /> }}
        />
      </WorkbenchCard>

      <Modal title={editing ? "编辑赛道" : "新增赛道"} open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden width={760}>
        <ThesisForm form={form} />
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
