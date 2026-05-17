import { Button, Form, Modal, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { createTrackThesis, listTrackCandidates } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TrackCandidate } from "../../../types/api";
import { candidateTitle, trackWindowOptions } from "./shared";
import { ThesisForm, type ThesisFormValues } from "./ThesisForm";

export function CandidatesSection() {
  const [window, setWindow] = useState("24h");
  const candidates = useAsyncData(useCallback(() => listTrackCandidates(window), [window]), []);
  const [selected, setSelected] = useState<TrackCandidate | null>(null);
  const [form] = Form.useForm<ThesisFormValues>();

  function openCreate(record: TrackCandidate) {
    setSelected(record);
    form.setFieldsValue({
      title: candidateTitle(record),
      core_thesis: `${candidateTitle(record)} 在 ${record.heat.window_type} 窗口热度排名 ${record.heat.rank_no}，需要进一步验证底层变化、产业链迁移和相关标的。`,
      underlying_change: record.tag.category || undefined,
      confidence_level: "medium",
      time_horizon: "6-12M",
      status: "watching"
    });
  }

  async function submit() {
    const values = await form.validateFields();
    await createTrackThesis({
      ...values,
      underlying_change: values.underlying_change || null,
      old_bottleneck: values.old_bottleneck || null,
      new_solution: values.new_solution || null,
      value_chain_shift: values.value_chain_shift || null,
      time_horizon: values.time_horizon || null,
      confidence_level: values.confidence_level || null
    });
    message.success("已创建赛道跟踪");
    setSelected(null);
  }

  const columns: ColumnsType<TrackCandidate> = [
    { title: "排名", dataIndex: ["heat", "rank_no"], width: 72 },
    { title: "候选赛道", render: (_, record) => candidateTitle(record) },
    { title: "分类", dataIndex: ["tag", "category"], width: 130, render: (value) => value || "-" },
    { title: "热度", dataIndex: ["heat", "heat_score"], width: 100, render: (value) => Number(value || 0).toFixed(1) },
    { title: "触发", dataIndex: ["heat", "trigger_count"], width: 80 },
    { title: "来源", dataIndex: ["heat", "source_count"], width: 80 },
    { title: "操作", width: 110, render: (_, record) => <Button size="small" onClick={() => openCreate(record)}>创建跟踪</Button> }
  ];

  return (
    <>
      <WorkbenchCard
        title="候选赛道"
        extra={
          <Space>
            <Select size="small" value={window} options={trackWindowOptions} style={{ width: 90 }} onChange={setWindow} />
          </Space>
        }
      >
        <Table
          rowKey={(record) => `${record.tag.id}:${record.heat.window_type}`}
          size="small"
          loading={candidates.loading}
          dataSource={candidates.data}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无候选赛道，先运行市场雷达热度聚合任务" /> }}
        />
      </WorkbenchCard>

      <Modal title="创建赛道跟踪" open={Boolean(selected)} onCancel={() => setSelected(null)} onOk={submit} destroyOnHidden width={760}>
        <ThesisForm form={form} />
      </Modal>
    </>
  );
}
