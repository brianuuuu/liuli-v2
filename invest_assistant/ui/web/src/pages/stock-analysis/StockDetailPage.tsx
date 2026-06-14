import { Button, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";
import type { Time } from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiuliTheme } from "../../app/theme";
import { listTracks } from "../../api/trackDiscovery";
import {
  bindStockTrackRelation,
  createStockNote,
  createStockScore,
  disableStockTrackRelation,
  getStockDailyBars,
  getStockDetail,
  listStockPool,
  updateStockMaterial
} from "../../api/stockAnalysis";
import { chartBackgroundColor, chartGridColor, chartTextColor } from "../../components/charts/chartTheme";
import { EmptyAction } from "../../components/common/EmptyAction";
import { PageHeader } from "../../components/common/PageHeader";
import { WorkbenchCard } from "../../components/common/WorkbenchCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import type {
  StockDetail,
  StockDetailValuationSnapshot,
  StockDailyBar,
  StockMaterial,
  StockResearchNote,
  StockScoreSnapshot,
  StockTrackRelation
} from "../../types/api";
import { formatTime, poolStatusOptions, scoreTrendOption } from "./sections/shared";

type NoteFormValues = {
  note_type: string;
  title: string;
  content: string;
  related_track_id?: number;
};

type ScoreFormValues = {
  score_date: string;
  track_id?: number;
  growth_score?: number;
  valuation_score?: number;
  moat_score?: number;
  risk_score?: number;
  total_score?: number;
};

type TrackBindingFormValues = {
  track_id: number;
  relation_type?: string;
  conviction?: number;
  reason?: string;
};

const materialTypeLabels: Record<string, string> = {
  source_item: "信息流",
  knowledge_note: "研究笔记",
  company_disclosure: "公告财报"
};

const directionLabels: Record<string, string> = {
  positive: "正向",
  negative: "负向",
  neutral: "中性",
  noise: "噪音"
};

function numberText(value?: number | null, suffix = "") {
  return value === null || value === undefined ? "-" : `${Number(value).toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function statusText(status?: string | null) {
  return poolStatusOptions.find((item) => item.value === status)?.label || status || "-";
}

function valuationTrendOption(rows: StockDetailValuationSnapshot[]): EChartsOption {
  const ordered = [...rows].filter((item) => item.analysis_date).sort((a, b) => String(a.analysis_date).localeCompare(String(b.analysis_date)));
  return {
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 48, right: 18, top: 34, bottom: 28 },
    xAxis: { type: "category", data: ordered.map((item) => item.analysis_date || "-") },
    yAxis: [
      { type: "value", name: "市值" },
      { type: "value", name: "缺口" }
    ],
    series: [
      { name: "当前市值", type: "line", smooth: true, data: ordered.map((item) => item.current_market_value ?? null) },
      { name: "三年预期市值", type: "line", smooth: true, data: ordered.map((item) => item.expected_market_value_3y ?? null) },
      { name: "预期缺口", type: "bar", yAxisIndex: 1, data: ordered.map((item) => item.expectation_gap_rate ?? null) }
    ]
  };
}

export function StockDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const stockId = Number(id || 0);
  const detail = useAsyncData(useCallback(() => (stockId ? getStockDetail(stockId) : Promise.resolve(null)), [stockId]), null);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const stockPool = useAsyncData(useCallback(() => listStockPool(), []), []);
  const [noteOpen, setNoteOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [bindingOpen, setBindingOpen] = useState(false);
  const [noteForm] = Form.useForm<NoteFormValues>();
  const [scoreForm] = Form.useForm<ScoreFormValues>();
  const [bindingForm] = Form.useForm<TrackBindingFormValues>();

  const trackOptions = useMemo(() => tracks.data.map((track) => ({ value: track.id, label: track.name })), [tracks.data]);
  const stockSwitchOptions = useMemo(
    () =>
      stockPool.data.map((item) => ({
        value: item.stock_id,
        label: item.stock_name || item.stock_code || `Stock ${item.stock_id}`,
        searchText: `${item.stock_name || ""} ${item.stock_code || ""}`,
        disabled: item.stock_id === stockId,
      })),
    [stockId, stockPool.data]
  );

  function switchStock(targetStockId: number) {
    if (!targetStockId || targetStockId === stockId) return;
    navigate(`/stock-analysis/stocks/${targetStockId}`);
  }

  async function submitNote() {
    const values = await noteForm.validateFields();
    await createStockNote(stockId, {
      note_type: values.note_type,
      title: values.title,
      content: values.content,
      related_track_id: values.related_track_id || null
    });
    message.success("研究笔记已新增");
    noteForm.resetFields();
    setNoteOpen(false);
    await detail.refresh();
  }

  async function submitScore() {
    const values = await scoreForm.validateFields();
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
    scoreForm.resetFields();
    setScoreOpen(false);
    await detail.refresh();
  }

  async function submitBinding() {
    const values = await bindingForm.validateFields();
    await bindStockTrackRelation(stockId, {
      track_id: values.track_id,
      relation_type: values.relation_type || null,
      conviction: values.conviction || 0,
      reason: values.reason || null,
      status: "active"
    });
    message.success("赛道关系已更新");
    bindingForm.resetFields();
    setBindingOpen(false);
    await detail.refresh();
  }

  async function disableBinding(record: StockTrackRelation) {
    await disableStockTrackRelation(record.id);
    message.success("赛道关系已停用");
    await detail.refresh();
  }

  async function updateMaterialStatus(record: StockMaterial, status: string) {
    await updateStockMaterial(record.id, { status });
    message.success("材料状态已更新");
    await detail.refresh();
  }

  if (!stockId) {
    return (
      <>
        <PageHeader title="标的详情" description="无效 ID" />
        <WorkbenchCard><EmptyAction description="标的 ID 无效" /></WorkbenchCard>
      </>
    );
  }

  const data = detail.data;

  return (
    <>
      {!data ? (
        <>
          <PageHeader
            title="标的详情"
            description={`Stock ID：${id || "-"}`}
            actions={<StockDetailActions stockId={stockId} options={stockSwitchOptions} loading={stockPool.loading} onSwitch={switchStock} />}
          />
          <WorkbenchCard><EmptyAction description={detail.loading ? "加载中" : "标的不存在或暂无详情数据"} /></WorkbenchCard>
        </>
      ) : (
        <>
          <PageHeader
            title="标的详情"
            actions={<StockDetailActions stockId={stockId} options={stockSwitchOptions} loading={stockPool.loading} onSwitch={switchStock} />}
          />
          <div className="stock-detail">
            <StockIdentityPanel data={data} />
            <Tabs
              className="stock-detail-tabs"
              items={[
                { key: "overview", label: "概览", children: <OverviewTab data={data} /> },
                { key: "kline", label: "行情", children: <KlineTab stockId={stockId} /> },
                {
                  key: "scores",
                  label: "评分",
                  children: (
                    <ScoresTab
                      data={data}
                      onAddScore={() => setScoreOpen(true)}
                    />
                  )
                },
                { key: "valuation", label: "估值", children: <ValuationTab data={data} /> },
                {
                  key: "materials",
                  label: "材料公告",
                  children: (
                    <MaterialsTab
                      data={data}
                      onConfirm={(record) => updateMaterialStatus(record, "confirmed")}
                      onIgnore={(record) => updateMaterialStatus(record, "ignored")}
                    />
                  )
                },
                {
                  key: "relations",
                  label: "赛道关系",
                  children: (
                    <RelationsTab
                      data={data}
                      onAddBinding={() => setBindingOpen(true)}
                      onDisableBinding={disableBinding}
                    />
                  )
                },
                { key: "notes", label: "研究笔记", children: <NotesTab data={data} onAddNote={() => setNoteOpen(true)} /> }
              ]}
            />
          </div>
        </>
      )}

      <Modal title="新增评分" open={scoreOpen} onCancel={() => setScoreOpen(false)} onOk={submitScore} destroyOnHidden forceRender width={680}>
        <Form form={scoreForm} layout="vertical" preserve={false}>
          <div className="stock-detail-form-grid">
            <Form.Item name="score_date" label="评分日" rules={[{ required: true, message: "请输入评分日" }]}>
              <input className="ant-input" type="date" />
            </Form.Item>
            <Form.Item name="track_id" label="关联赛道">
              <Select allowClear showSearch options={trackOptions} loading={tracks.loading} />
            </Form.Item>
            <Form.Item name="total_score" label="总分"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="growth_score" label="成长"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="valuation_score" label="估值"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="moat_score" label="护城河"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="risk_score" label="风险"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal title="绑定赛道" open={bindingOpen} onCancel={() => setBindingOpen(false)} onOk={submitBinding} destroyOnHidden forceRender width={620}>
        <Form form={bindingForm} layout="vertical" preserve={false}>
          <div className="stock-detail-form-grid compact">
            <Form.Item name="track_id" label="赛道" rules={[{ required: true, message: "请选择赛道" }]}>
              <Select showSearch options={trackOptions} loading={tracks.loading} />
            </Form.Item>
            <Form.Item name="relation_type" label="关系类型"><Input placeholder="core / related / watch" /></Form.Item>
            <Form.Item name="conviction" label="确信度"><InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} /></Form.Item>
          </div>
          <Form.Item name="reason" label="判断理由"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增研究笔记" open={noteOpen} onCancel={() => setNoteOpen(false)} onOk={submitNote} destroyOnHidden forceRender width={680}>
        <Form form={noteForm} layout="vertical" preserve={false}>
          <div className="stock-detail-form-grid compact">
            <Form.Item name="note_type" label="类型" rules={[{ required: true, message: "请输入类型" }]}>
              <Select options={[{ value: "thesis", label: "投资逻辑" }, { value: "risk", label: "风险" }, { value: "memo", label: "备忘" }]} />
            </Form.Item>
            <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}><Input /></Form.Item>
            <Form.Item name="related_track_id" label="关联赛道"><Select allowClear showSearch options={trackOptions} loading={tracks.loading} /></Form.Item>
          </div>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: "请输入内容" }]}><Input.TextArea rows={5} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function StockDetailActions({
  stockId,
  options,
  loading,
  onSwitch,
}: {
  stockId: number;
  options: { value: number; label: string; searchText: string; disabled?: boolean }[];
  loading: boolean;
  onSwitch: (stockId: number) => void;
}) {
  return (
    <div className="stock-detail-actions">
      <span className="stock-detail-action-label">切换标的</span>
      <Select
        className="stock-detail-switcher"
        size="small"
        value={stockId || undefined}
        placeholder="切换标的"
        loading={loading}
        showSearch
        optionFilterProp="searchText"
        options={options}
        onChange={onSwitch}
        popupMatchSelectWidth={220}
      />
      <Link to="/stock-analysis" className="stock-detail-back-link">返回标的分析</Link>
    </div>
  );
}

function StockIdentityPanel({ data }: { data: StockDetail }) {
  const activeTracks = data.tracks.filter((item) => item.status === "active");
  const sourceItemCount = data.materials.filter((item) => item.material_type === "source_item").length;
  return (
    <WorkbenchCard>
      <div className="stock-detail-identity">
        <div className="stock-detail-title-row">
          <span className="stock-detail-title">{data.stock.stock_name || "-"}</span>
          <span className="stock-detail-code">{data.stock.stock_code || "-"}</span>
        </div>
        <div className="stock-detail-metrics">
          <Metric label="状态" value={statusText(data.pool?.status || data.stock.status)} />
          <div className="stock-detail-metric track">
            <span>关联赛道</span>
            <div className="stock-detail-track-tags">
              {activeTracks.length ? activeTracks.map((item) => <Tag key={item.id}>{item.track?.name || item.track_id}</Tag>) : <strong>-</strong>}
            </div>
          </div>
          <Metric label="笔记" value={String(data.summary.note_count)} />
          <Metric label="信息流" value={String(sourceItemCount)} />
        </div>
      </div>
    </WorkbenchCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="stock-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OverviewTab({ data }: { data: StockDetail }) {
  const latestNote = data.notes[0];
  const importantMaterials = data.materials.filter((item) => item.importance_level === "high").slice(0, 5);
  return (
    <WorkbenchCard>
      <div className="stock-detail-overview-panel">
        <div className="stock-detail-overview-main">
          {latestNote ? (
            <div className="stock-detail-note-summary">
              <Typography.Text type="secondary">{latestNote.note_type} / {formatTime(latestNote.updated_at)}</Typography.Text>
              <Typography.Title level={5}>{latestNote.title}</Typography.Title>
              <Typography.Paragraph>{latestNote.content}</Typography.Paragraph>
            </div>
          ) : (
            <EmptyAction description="暂无研究判断" />
          )}
          <div className="detail-list stock-detail-keyfacts">
            <div className="detail-row"><span>入池状态</span><span>{data.pool?.status || data.stock.status || "-"}</span></div>
            <div className="detail-row"><span>最新评分</span><span>{numberText(data.latest_score?.total_score)}</span></div>
            <div className="detail-row"><span>评分日</span><span>{data.latest_score?.score_date || "-"}</span></div>
            <div className="detail-row"><span>估值期</span><span>{data.latest_valuation?.report_period || "-"}</span></div>
            <div className="detail-row"><span>当前市值</span><span>{numberText(data.latest_valuation?.current_market_value)}</span></div>
            <div className="detail-row"><span>高重要材料</span><span>{data.summary.high_importance_material_count}</span></div>
          </div>
        </div>
        <div className="stock-detail-overview-main">
          <div>
            <div className="stock-detail-subtitle">最近重要材料</div>
            {importantMaterials.length ? <MaterialList rows={importantMaterials} /> : <EmptyAction description="暂无高重要材料" />}
          </div>
          <div>
            <div className="stock-detail-subtitle">公告财报</div>
            {data.disclosures.length ? <DisclosureList rows={data.disclosures.slice(0, 5)} /> : <EmptyAction description="暂无公告财报材料" />}
          </div>
        </div>
      </div>
    </WorkbenchCard>
  );
}

type MaKey = "ma5" | "ma20" | "ma60" | "ma250";

const maSeriesConfig: Record<MaKey, { label: string; color: string }> = {
  ma5: { label: "MA5", color: "#d97706" },
  ma20: { label: "MA20", color: "#2563eb" },
  ma60: { label: "MA60", color: "#9333ea" },
  ma250: { label: "MA250", color: "#db2777" }
};

const maVisibleRangeMonths: Record<MaKey, number> = {
  ma5: 3,
  ma20: 6,
  ma60: 12,
  ma250: 36
};

function largestVisibleMa(visibleMas: MaKey[]): MaKey | null {
  if (!visibleMas.length) {
    return null;
  }
  return visibleMas.reduce((largest, current) => (maVisibleRangeMonths[current] > maVisibleRangeMonths[largest] ? current : largest));
}

function shiftDateByMonths(value: string, months: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setMonth(date.getMonth() - months);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function klineVisibleRange(rows: StockDailyBar[], visibleMas: MaKey[]): { from: Time; to: Time } | null {
  if (!rows.length) {
    return null;
  }
  const selectedMa = largestVisibleMa(visibleMas);
  const firstDate = rows[0].trade_date;
  const lastDate = rows[rows.length - 1].trade_date;
  if (!selectedMa) {
    return null;
  }
  const targetFrom = shiftDateByMonths(lastDate, maVisibleRangeMonths[selectedMa]);
  return {
    from: (targetFrom <= firstDate ? firstDate : targetFrom) as Time,
    to: lastDate as Time
  };
}

function applyKlineVisibleRange(chart: ReturnType<typeof createChart>, rows: StockDailyBar[], visibleMas: MaKey[]) {
  const range = klineVisibleRange(rows, visibleMas);
  if (range) {
    chart.timeScale().setVisibleRange(range);
  } else {
    chart.timeScale().fitContent();
  }
}

function KlineTab({ stockId }: { stockId: number }) {
  const [rows, setRows] = useState<StockDailyBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleMas, setVisibleMas] = useState<MaKey[]>(["ma5", "ma20", "ma250"]);

  const loadBars = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const nextRows = await getStockDailyBars(stockId, refresh ? { refresh: true } : {});
        setRows(nextRows);
        if (refresh) {
          message.success("行情已刷新");
        }
      } catch (nextError) {
        const detail = nextError instanceof Error ? nextError.message : "行情数据加载失败";
        setError(detail);
      } finally {
        setLoading(false);
      }
    },
    [stockId]
  );

  useEffect(() => {
    void loadBars(false);
  }, [loadBars]);

  return (
    <WorkbenchCard>
      <div className="stock-detail-panel stock-kline-panel">
        <div className="stock-detail-panel-toolbar stock-kline-toolbar">
          <span>日线行情</span>
          <Space size={12} wrap>
            <Checkbox.Group
              className="stock-kline-ma-toggle"
              options={(Object.keys(maSeriesConfig) as MaKey[]).map((key) => ({ label: maSeriesConfig[key].label, value: key }))}
              value={visibleMas}
              onChange={(values) => setVisibleMas(values as MaKey[])}
            />
            <Button size="small" type="primary" loading={loading} onClick={() => loadBars(true)}>刷新行情</Button>
          </Space>
        </div>
        <div className="stock-detail-panel-section first">
          {error ? (
            <EmptyAction description={`行情数据加载失败：${error}`} />
          ) : rows.length ? (
            <DailyBarChart rows={rows} visibleMas={visibleMas} />
          ) : (
            <EmptyAction description={loading ? "行情加载中" : "暂无行情数据"} />
          )}
        </div>
      </div>
    </WorkbenchCard>
  );
}

function DailyBarChart({ rows, visibleMas }: { rows: StockDailyBar[]; visibleMas: MaKey[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { resolvedMode } = useLiuliTheme();
  const activeMas = visibleMas.join(",");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !rows.length) {
      return;
    }

    const isDark = resolvedMode === "dark";
    const chart = createChart(container, {
      width: container.clientWidth || 720,
      height: 520,
      layout: {
        background: { color: chartBackgroundColor(resolvedMode) },
        textColor: chartTextColor(resolvedMode),
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: chartGridColor(resolvedMode) },
        horzLines: { color: chartGridColor(resolvedMode) },
      },
      rightPriceScale: {
        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.12)",
        scaleMargins: { top: 0.06, bottom: 0.24 },
      },
      timeScale: {
        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.12)",
        timeVisible: false,
      },
      crosshair: { mode: 1 },
    });

    const upColor = "#ef4444";
    const downColor = "#16a34a";
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });
    candleSeries.setData(
      rows.map((row) => ({
        time: row.trade_date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
      }))
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeries.setData(
      rows.map((row) => ({
        time: row.trade_date,
        value: row.vol ?? 0,
        color: row.close >= row.open ? "rgba(239,68,68,0.42)" : "rgba(22,163,74,0.42)",
      }))
    );
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    (Object.keys(maSeriesConfig) as MaKey[]).forEach((key) => {
      if (!visibleMas.includes(key)) {
        return;
      }
      const series = chart.addSeries(LineSeries, {
        color: maSeriesConfig[key].color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(
        rows
          .filter((row) => row[key] !== null && row[key] !== undefined)
          .map((row) => ({
            time: row.trade_date,
            value: Number(row[key]),
          }))
      );
    });

    applyKlineVisibleRange(chart, rows, visibleMas);
    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: Math.max(Math.floor(entry.contentRect.width), 320), height: 520 });
      applyKlineVisibleRange(chart, rows, visibleMas);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [activeMas, resolvedMode, rows, visibleMas]);

  return (
    <div className="stock-kline-chart-wrap">
      <div className="stock-kline-legend">
        {(Object.keys(maSeriesConfig) as MaKey[]).map((key) => (
          <span key={key} className={visibleMas.includes(key) ? "active" : ""}>
            <i style={{ backgroundColor: maSeriesConfig[key].color }} />
            {maSeriesConfig[key].label}
          </span>
        ))}
      </div>
      <div ref={containerRef} className="stock-kline-chart" />
    </div>
  );
}

function InlineChart({ option, height = 240 }: { option: EChartsOption; height?: number }) {
  const { resolvedMode } = useLiuliTheme();
  return (
    <ReactECharts
      option={{ backgroundColor: chartBackgroundColor(resolvedMode), ...option }}
      style={{ height, width: "100%" }}
      notMerge
    />
  );
}

function ScoresTab({ data, onAddScore }: { data: StockDetail; onAddScore: () => void }) {
  const scoreColumns: ColumnsType<StockScoreSnapshot> = [
    { title: "评分日", dataIndex: "score_date", width: 110 },
    { title: "总分", dataIndex: "total_score", width: 80, render: (value) => numberText(value) },
    { title: "成长", dataIndex: "growth_score", width: 80, render: (value) => numberText(value) },
    { title: "估值", dataIndex: "valuation_score", width: 80, render: (value) => numberText(value) },
    { title: "护城河", dataIndex: "moat_score", width: 90, render: (value) => numberText(value) },
    { title: "风险", dataIndex: "risk_score", width: 80, render: (value) => numberText(value) },
    { title: "创建时间", dataIndex: "created_at", width: 160, render: formatTime }
  ];
  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <div className="stock-detail-panel-toolbar">
          <span>评分记录</span>
          <Button size="small" type="primary" onClick={onAddScore}>新增评分</Button>
        </div>
        <div className="stock-detail-panel-section first">
          <div className="stock-detail-subtitle">评分趋势</div>
          {data.score_history.length ? <InlineChart option={scoreTrendOption(data.score_history)} /> : <EmptyAction description="暂无评分趋势" />}
          <Table rowKey="id" size="small" dataSource={data.score_history} columns={scoreColumns} pagination={{ defaultPageSize: 8 }} />
        </div>
      </div>
    </WorkbenchCard>
  );
}

function ValuationTab({ data }: { data: StockDetail }) {
  const valuationColumns: ColumnsType<StockDetailValuationSnapshot> = [
    { title: "分析日", dataIndex: "analysis_date", width: 110, render: (value) => value || "-" },
    { title: "报告期", dataIndex: "report_period", width: 110, render: (value) => value || "-" },
    { title: "当前市值", dataIndex: "current_market_value", width: 120, render: (value) => numberText(value) },
    { title: "三年预期市值", dataIndex: "expected_market_value_3y", width: 130, render: (value) => numberText(value) },
    { title: "预期缺口", dataIndex: "expectation_gap_rate", width: 110, render: (value) => numberText(value, "%") },
    { title: "模型", dataIndex: "primary_model", width: 100, render: (value) => value || "-" },
    { title: "研究员", dataIndex: "researcher", width: 100, render: (value) => value || "-" }
  ];
  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <div className="stock-detail-panel-toolbar">
          <span>估值记录</span>
        </div>
        <div className="stock-detail-panel-section first">
          <div className="stock-detail-subtitle">估值趋势</div>
          {data.valuation_history.length ? <InlineChart option={valuationTrendOption(data.valuation_history)} /> : <EmptyAction description="暂无估值趋势" />}
          <Table rowKey="id" size="small" dataSource={data.valuation_history} columns={valuationColumns} pagination={{ defaultPageSize: 8 }} scroll={{ x: 860 }} />
        </div>
      </div>
    </WorkbenchCard>
  );
}

function MaterialsTab({
  data,
  onConfirm,
  onIgnore
}: {
  data: StockDetail;
  onConfirm: (record: StockMaterial) => void;
  onIgnore: (record: StockMaterial) => void;
}) {
  const columns: ColumnsType<StockMaterial> = [
    { title: "来源", dataIndex: "material_type", width: 100, render: (value) => materialTypeLabels[value] || value },
    {
      title: "标题",
      dataIndex: "material_title",
      render: (value, record) => record.material_url ? <a href={record.material_url} target="_blank" rel="noreferrer">{value || "-"}</a> : value || "-"
    },
    { title: "时间", dataIndex: "material_time", width: 160, render: formatTime },
    { title: "重要性", dataIndex: "importance_level", width: 90, render: (value) => value ? <Tag color={value === "high" ? "red" : value === "medium" ? "gold" : "default"}>{value}</Tag> : "-" },
    { title: "方向", dataIndex: "impact_direction", width: 90, render: (value) => value ? directionLabels[value] || value : "-" },
    { title: "状态", dataIndex: "status", width: 90 },
    { title: "公告类型", dataIndex: "disclosure_type", width: 110, render: (value) => value || "-" },
    { title: "报告期", dataIndex: "report_period", width: 90, render: (value) => value || "-" },
    { title: "备注", dataIndex: "note", ellipsis: true, render: (value) => value || "-" },
    {
      title: "操作",
      width: 130,
      render: (_, record) => (
        <Space>
          <Button size="small" disabled={record.status === "confirmed"} onClick={() => onConfirm(record)}>确认</Button>
          <Button size="small" disabled={record.status === "ignored"} onClick={() => onIgnore(record)}>忽略</Button>
        </Space>
      )
    }
  ];
  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <Table rowKey="id" size="small" dataSource={data.materials} columns={columns} pagination={{ defaultPageSize: 10 }} scroll={{ x: 1100 }} />
      </div>
    </WorkbenchCard>
  );
}

function RelationsTab({
  data,
  onAddBinding,
  onDisableBinding
}: {
  data: StockDetail;
  onAddBinding: () => void;
  onDisableBinding: (record: StockTrackRelation) => void;
}) {
  const relationColumns: ColumnsType<StockTrackRelation> = [
    { title: "赛道", render: (_, record) => record.track?.name || record.track_id },
    { title: "关系", dataIndex: "relation_type", width: 120, render: (value) => value || "-" },
    { title: "确信度", dataIndex: "conviction", width: 90, render: (value) => numberText(value) },
    { title: "状态", dataIndex: "status", width: 90 },
    { title: "原因", dataIndex: "reason", ellipsis: true, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    {
      title: "操作",
      width: 90,
      render: (_, record) => <Button size="small" danger disabled={record.status === "disabled"} onClick={() => onDisableBinding(record)}>停用</Button>
    }
  ];
  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <div className="stock-detail-panel-toolbar">
          <span>赛道关系</span>
          <Button size="small" type="primary" onClick={onAddBinding}>绑定赛道</Button>
        </div>
        <div className="stock-detail-panel-section first">
          <div className="stock-detail-inline-tags">
            <span>标签</span>
            {data.tags.length ? data.tags.map((item) => <Tag key={item.id}>{item.tag?.name || "-"}</Tag>) : <Typography.Text type="secondary">暂无标签</Typography.Text>}
          </div>
          <Table rowKey="id" size="small" dataSource={data.tracks} columns={relationColumns} pagination={{ defaultPageSize: 8 }} />
        </div>
      </div>
    </WorkbenchCard>
  );
}

function NotesTab({ data, onAddNote }: { data: StockDetail; onAddNote: () => void }) {
  const noteColumns: ColumnsType<StockResearchNote> = [
    { title: "类型", dataIndex: "note_type", width: 110 },
    { title: "标题", dataIndex: "title" },
    { title: "关联赛道", dataIndex: "related_track_id", width: 100, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime }
  ];
  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <div className="stock-detail-panel-toolbar">
          <span>研究笔记</span>
          <Button size="small" type="primary" onClick={onAddNote}>新增笔记</Button>
        </div>
        <div className="stock-detail-panel-section first">
          <Table rowKey="id" size="small" dataSource={data.notes} columns={noteColumns} pagination={{ defaultPageSize: 8 }} />
        </div>
      </div>
    </WorkbenchCard>
  );
}

function MaterialList({ rows }: { rows: StockMaterial[] }) {
  return (
    <div className="stock-detail-list">
      {rows.map((item) => (
        <div className="stock-detail-list-item" key={item.id}>
          <span>{materialTypeLabels[item.material_type] || item.material_type}</span>
          <strong>{item.material_title || "-"}</strong>
          <em>{formatTime(item.material_time)}</em>
        </div>
      ))}
    </div>
  );
}

function DisclosureList({ rows }: { rows: StockDetail["disclosures"] }) {
  return (
    <div className="stock-detail-list">
      {rows.map((item) => (
        <div className="stock-detail-list-item" key={item.id}>
          <span>{item.disclosure_type}</span>
          <strong>{item.title}</strong>
          <em>{formatTime(item.publish_time)}</em>
        </div>
      ))}
    </div>
  );
}
