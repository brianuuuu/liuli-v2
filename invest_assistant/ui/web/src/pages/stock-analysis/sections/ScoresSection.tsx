import { Button, Form, InputNumber, Select, Space, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { createStockScore, listStockPool, listStockScores } from "../../../api/stockAnalysis";
import { ChartCard } from "../../../components/charts/ChartCard";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { StockScoreSnapshot } from "../../../types/api";
import { scoreTrendOption } from "./shared";

type ScoreFormValues = {
  score_date: string;
  track_id?: number;
  growth_score?: number;
  valuation_score?: number;
  moat_score?: number;
  risk_score?: number;
  total_score?: number;
};

export function ScoresSection() {
  const pool = useAsyncData(useCallback(listStockPool, []), []);
  const [stockId, setStockId] = useState<number | undefined>();
  const scores = useAsyncData(useCallback(() => (stockId ? listStockScores(stockId) : Promise.resolve([])), [stockId]), []);
  const [form] = Form.useForm<ScoreFormValues>();
  const poolOptions = useMemo(() => pool.data.map((item) => ({ value: item.stock_id, label: `Stock ${item.stock_id}` })), [pool.data]);

  async function submit() {
    if (!stockId) {
      message.warning("请先选择标的");
      return;
    }
    const values = await form.validateFields();
    await createStockScore(stockId, {
      score_date: values.score_date,
      track_id: values.track_id || null,
      growth_score: values.growth_score || 0,
      valuation_score: values.valuation_score || 0,
      moat_score: values.moat_score || 0,
      risk_score: values.risk_score || 0,
      total_score: values.total_score || 0
    });
    message.success("评分快照已新增");
    form.resetFields();
    await scores.refresh();
  }

  const columns: ColumnsType<StockScoreSnapshot> = [
    { title: "日期", dataIndex: "score_date", width: 120 },
    { title: "总分", dataIndex: "total_score", width: 80 },
    { title: "成长", dataIndex: "growth_score", width: 80 },
    { title: "估值", dataIndex: "valuation_score", width: 80 },
    { title: "护城河", dataIndex: "moat_score", width: 90 },
    { title: "风险", dataIndex: "risk_score", width: 80 },
    { title: "Track ID", dataIndex: "track_id", render: (value) => value || "-" }
  ];

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <DataPanel
        toolbar={
          <>
            <Select showSearch size="small" placeholder="选择标的" value={stockId} options={poolOptions} style={{ width: 220 }} onChange={setStockId} />
            <div className="data-panel-toolbar-spacer" />
          </>
        }
      >
        {scores.data.length ? <ChartCard title="评分趋势" option={scoreTrendOption(scores.data)} height={260} /> : <EmptyAction description={stockId ? "暂无评分快照" : "请选择标的"} />}
        <Table rowKey="id" size="small" loading={scores.loading} dataSource={scores.data} columns={columns} pagination={{ pageSize: 10 }} />
      </DataPanel>

      <WorkbenchCard title="新增评分">
        <Form form={form} layout="vertical" preserve={false} onFinish={submit}>
          <Space.Compact block>
            <Form.Item name="score_date" label="日期" style={{ width: "25%" }} rules={[{ required: true, message: "请输入日期" }]}>
              <input className="ant-input" type="date" />
            </Form.Item>
            <Form.Item name="track_id" label="Track ID" style={{ width: "25%" }}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="total_score" label="总分" style={{ width: "25%" }}>
              <InputNumber min={0} max={100} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="risk_score" label="风险" style={{ width: "25%" }}>
              <InputNumber min={0} max={100} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="growth_score" label="成长" style={{ width: "33%" }}>
              <InputNumber min={0} max={100} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="valuation_score" label="估值" style={{ width: "34%" }}>
              <InputNumber min={0} max={100} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="moat_score" label="护城河" style={{ width: "33%" }}>
              <InputNumber min={0} max={100} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
          <Button htmlType="submit" size="small" type="primary" disabled={!stockId}>新增评分</Button>
        </Form>
      </WorkbenchCard>
    </Space>
  );
}
