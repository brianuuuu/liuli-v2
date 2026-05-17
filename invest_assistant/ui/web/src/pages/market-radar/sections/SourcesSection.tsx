import { SyncOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, Modal, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { createSourceItem, listSourceItems, syncClsMarketFlashes } from "../../../api/marketRadar";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { SourceItem } from "../../../types/api";
import { formatTime } from "./shared";

type SourceFormValues = {
  source_type: string;
  source_name: string;
  title: string;
  content: string;
  source_url?: string;
  publish_time?: string;
};

export function SourcesSection() {
  const sources = useAsyncData(useCallback(listSourceItems, []), []);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SourceItem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [form] = Form.useForm<SourceFormValues>();

  function openCreate() {
    form.setFieldsValue({ source_type: "news", source_name: "manual" });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    await createSourceItem({
      ...values,
      source_url: values.source_url || null,
      publish_time: values.publish_time || null
    });
    message.success("市场快讯已新增");
    setOpen(false);
    await sources.refresh();
  }

  async function syncCls() {
    setSyncing(true);
    try {
      const result = await syncClsMarketFlashes(100);
      if (!result.success) {
        message.error(result.message || "同步财联社快讯失败");
        return;
      }
      message.success(`新增 ${result.inserted_count} 条，跳过 ${result.skipped_count} 条`);
      await sources.refresh();
    } finally {
      setSyncing(false);
    }
  }

  const columns: ColumnsType<SourceItem> = [
    { title: "标题", dataIndex: "title", ellipsis: true },
    { title: "类型", dataIndex: "source_type", width: 90 },
    { title: "来源", dataIndex: "source_name", width: 130 },
    { title: "发布时间", dataIndex: "publish_time", width: 160, render: formatTime },
    { title: "入库时间", dataIndex: "created_at", width: 160, render: formatTime },
    { title: "操作", width: 80, render: (_, record) => <Button size="small" onClick={() => setDetail(record)}>详情</Button> }
  ];

  return (
    <>
      <DataPanel
        toolbar={
          <>
            <div className="data-panel-toolbar-spacer" />
            <Button size="small" icon={<SyncOutlined />} loading={syncing} onClick={syncCls}>同步财联社</Button>
            <Button size="small" type="primary" onClick={openCreate}>手动新增</Button>
          </>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={sources.loading}
          dataSource={sources.data}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无市场快讯，可同步财联社或手动新增" /> }}
        />
      </DataPanel>

      <Modal title="新增市场快讯" open={open} onCancel={() => setOpen(false)} onOk={submit} destroyOnHidden width={680}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="source_type" label="来源类型" style={{ width: "50%" }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="source_name" label="来源名称" style={{ width: "50%" }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="content" label="正文" rules={[{ required: true, message: "请输入正文" }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="source_url" label="来源 URL">
            <Input />
          </Form.Item>
          <Form.Item name="publish_time" label="发布时间">
            <Input placeholder="2026-05-16T09:30:00" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="市场快讯详情" open={Boolean(detail)} onClose={() => setDetail(null)} size={720}>
        {detail ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Title level={5}>{detail.title}</Typography.Title>
            <Typography.Text type="secondary">{detail.source_type} / {detail.source_name} / {formatTime(detail.publish_time)}</Typography.Text>
            {detail.source_url ? <Typography.Link href={detail.source_url} target="_blank">{detail.source_url}</Typography.Link> : null}
            <WorkbenchCard title="正文">
              <Typography.Paragraph copyable style={{ whiteSpace: "pre-wrap" }}>{detail.content}</Typography.Paragraph>
            </WorkbenchCard>
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
