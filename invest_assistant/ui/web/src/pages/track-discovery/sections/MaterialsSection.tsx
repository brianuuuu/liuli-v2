import { Button, Form, Input, InputNumber, Select, Space, Statistic, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { createTrackMaterial, listTrackMaterials, listTracks, updateTrackMaterial } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TrackMaterial } from "../../../types/api";
import { DirectionTag, formatTime } from "./shared";

type MaterialFormValues = {
  material_type: "source_item" | "knowledge_note";
  material_id: number;
  direction?: string;
  importance_level?: string;
  status?: string;
  note?: string;
};

const materialTypeOptions = [
  { value: "source_item", label: "信息流" },
  { value: "knowledge_note", label: "知识笔记" }
];

const directionOptions = [
  { value: "support", label: "support" },
  { value: "weaken", label: "weaken" },
  { value: "neutral", label: "neutral" },
  { value: "noise", label: "noise" }
];

const importanceOptions = [
  { value: "high", label: "high" },
  { value: "medium", label: "medium" },
  { value: "low", label: "low" }
];

const materialStatusOptions = [
  { value: "pending", label: "待确认" },
  { value: "confirmed", label: "已确认" },
  { value: "ignored", label: "已忽略" }
];

export function MaterialsSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [trackId, setTrackId] = useState<number | undefined>();
  const materials = useAsyncData(useCallback(() => (trackId ? listTrackMaterials(trackId) : Promise.resolve([])), [trackId]), []);
  const [form] = Form.useForm<MaterialFormValues>();
  const trackOptions = useMemo(() => tracks.data.map((item) => ({ value: item.id, label: item.name })), [tracks.data]);

  async function submitMaterial() {
    if (!trackId) {
      message.warning("请先选择赛道");
      return;
    }
    const values = await form.validateFields();
    await createTrackMaterial(trackId, {
      material_type: values.material_type,
      material_id: values.material_id,
      direction: values.direction || null,
      importance_level: values.importance_level || null,
      status: values.status || "pending",
      note: values.note || null
    });
    message.success("材料已引用");
    form.resetFields();
    await materials.refresh();
  }

  async function setStatus(record: TrackMaterial, status: string) {
    await updateTrackMaterial(record.id, { status });
    message.success("材料状态已更新");
    await materials.refresh();
  }

  const columns: ColumnsType<TrackMaterial> = [
    { title: "类型", dataIndex: "material_type", width: 110, render: (value) => materialTypeOptions.find((item) => item.value === value)?.label || value },
    { title: "材料 ID", dataIndex: "material_id", width: 90 },
    { title: "方向", dataIndex: "direction", width: 100, render: (value) => <DirectionTag direction={value} /> },
    { title: "重要性", dataIndex: "importance_level", width: 90, render: (value) => value || "-" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => materialStatusOptions.find((item) => item.value === value)?.label || value },
    { title: "判断", dataIndex: "note", ellipsis: true, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" disabled={record.status === "confirmed"} onClick={() => setStatus(record, "confirmed")}>确认</Button>
          <Button size="small" disabled={record.status === "ignored"} onClick={() => setStatus(record, "ignored")}>忽略</Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <DataPanel
        toolbar={
          <>
            <Select showSearch size="small" placeholder="选择赛道" value={trackId} options={trackOptions} loading={tracks.loading} style={{ width: 260 }} onChange={setTrackId} />
            <div className="data-panel-toolbar-spacer" />
          </>
        }
      >
        {trackId ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", padding: 16 }}>
            <Statistic title="引用材料" value={materials.data.length} loading={materials.loading} />
            <Table
              rowKey="id"
              size="small"
              loading={materials.loading}
              dataSource={materials.data}
              columns={columns}
              pagination={{ pageSize: 10 }}
              locale={{ emptyText: <EmptyAction description="暂无赛道材料" /> }}
            />
          </div>
        ) : (
          <EmptyAction description="请选择赛道后查看动态材料" />
        )}
      </DataPanel>

      <WorkbenchCard title="引用材料">
        <Form form={form} layout="vertical" preserve={false} onFinish={submitMaterial} initialValues={{ status: "pending", material_type: "source_item" }}>
          <Space.Compact block>
            <Form.Item name="material_type" label="来源" style={{ width: "25%" }} rules={[{ required: true, message: "请选择来源" }]}>
              <Select options={materialTypeOptions} />
            </Form.Item>
            <Form.Item name="material_id" label="材料 ID" style={{ width: "25%" }} rules={[{ required: true, message: "请输入材料 ID" }]}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="direction" label="方向" style={{ width: "25%" }}>
              <Select allowClear options={directionOptions} />
            </Form.Item>
            <Form.Item name="importance_level" label="重要性" style={{ width: "25%" }}>
              <Select allowClear options={importanceOptions} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={materialStatusOptions} />
          </Form.Item>
          <Form.Item name="note" label="赛道视角判断">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button htmlType="submit" size="small" type="primary" disabled={!trackId}>引用材料</Button>
        </Form>
      </WorkbenchCard>
    </div>
  );
}
