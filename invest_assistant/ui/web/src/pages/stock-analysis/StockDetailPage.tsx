import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
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
import { formatTime, poolStatusOptions } from "./sections/shared";
import {
  DEFAULT_SCORE_TREND_METRIC,
  SCORE_TREND_METRICS,
  buildScoreTrendBarOption
} from "./scoreTrendChart";
import type { ScoreTrendMetric } from "./scoreTrendChart";
import { buildLatestRatingOverview, buildLatestRatingRadarOption } from "./stockRatingOverview";
import {
  buildLatestValuationSummary,
  buildValuationComparisonOption,
  formatValuationGap,
  valuationGapTone,
  valuationModelLabel
} from "./valuationPresentation";

type NoteFormValues = {
  note_type: string;
  title: string;
  content: string;
  related_track_id?: number;
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

function stockKlineLatestSummary(value?: number | null, suffix = "") {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${Number(value).toFixed(2)}${suffix}`;
}

function stockKlineChangeClass(value?: number | null) {
  if (value === null || value === undefined || value === 0) {
    return "flat";
  }
  return value > 0 ? "positive" : "negative";
}

function stockKlinePctText(value?: number | null) {
  if (value === null || value === undefined) {
    return "-";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${stockKlineLatestSummary(value, "%")}`;
}

function statusText(status?: string | null) {
  return poolStatusOptions.find((item) => item.value === status)?.label || status || "-";
}

export function StockDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const stockId = Number(id || 0);
  const detail = useAsyncData(useCallback(() => (stockId ? getStockDetail(stockId) : Promise.resolve(null)), [stockId]), null);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const stockPool = useAsyncData(useCallback(() => listStockPool(), []), []);
  const [noteOpen, setNoteOpen] = useState(false);
  const [bindingOpen, setBindingOpen] = useState(false);
  const [noteForm] = Form.useForm<NoteFormValues>();
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
                  children: <ScoresTab data={data} />
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
  const { resolvedMode } = useLiuliTheme();
  const ratingOverview = buildLatestRatingOverview(data.latest_score);
  const importantMaterials = data.materials.filter((item) => item.importance_level === "high").slice(0, 5);
  return (
    <WorkbenchCard>
      <div className="stock-detail-overview-panel">
        <div className="stock-detail-overview-main">
          {ratingOverview ? (
            <div className="stock-rating-overview">
              <div className="stock-detail-subtitle">最新评级画像</div>
              <div className="stock-rating-overview-body">
                <div className="stock-rating-radar">
                  <InlineChart option={buildLatestRatingRadarOption(ratingOverview, resolvedMode)} height={244} />
                </div>
                <div className="stock-rating-summary">
                  <div className="stock-rating-score-row">
                    <div>
                      <span>综合评分</span>
                      <strong>{numberText(ratingOverview.totalScore)}</strong>
                    </div>
                    <div>
                      <span>投资等级</span>
                      <strong>{ratingOverview.investmentLevel || "-"}</strong>
                    </div>
                  </div>
                  <div className="stock-rating-copy">
                    <span>核心逻辑</span>
                    <p>{ratingOverview.coreLogic || "暂无核心逻辑"}</p>
                  </div>
                  <div className="stock-rating-copy risk">
                    <span>主要风险</span>
                    <p>{ratingOverview.primaryRisk || "暂无主要风险"}</p>
                  </div>
                  <div className="stock-rating-meta">
                    {ratingOverview.researcherCode || "未标注研究员"} · {ratingOverview.reportTime || "-"}
                  </div>
                </div>
              </div>
              {latestNote ? (
                <div className="stock-detail-note-summary stock-rating-latest-note">
                  <Typography.Text type="secondary">最新研究笔记 · {latestNote.note_type} / {formatTime(latestNote.updated_at)}</Typography.Text>
                  <Typography.Title level={5}>{latestNote.title}</Typography.Title>
                  <Typography.Paragraph ellipsis={{ rows: 3, expandable: true, symbol: "展开" }}>{latestNote.content}</Typography.Paragraph>
                </div>
              ) : null}
            </div>
          ) : (
            latestNote ? (
              <div className="stock-detail-note-summary">
                <Typography.Text type="secondary">{latestNote.note_type} / {formatTime(latestNote.updated_at)}</Typography.Text>
                <Typography.Title level={5}>{latestNote.title}</Typography.Title>
                <Typography.Paragraph>{latestNote.content}</Typography.Paragraph>
              </div>
            ) : <EmptyAction description="暂无评级画像和研究判断" />
          )}
          <div className="detail-list stock-detail-keyfacts">
            <div className="detail-row"><span>最新评分</span><span>{numberText(data.latest_score?.total_score)}</span></div>
            <div className="detail-row"><span>评分报告时间</span><span>{data.latest_score?.report_time || "-"}</span></div>
            <div className="detail-row"><span>最新估值时间</span><span>{data.latest_valuation?.analysis_date || "-"}</span></div>
            <div className="detail-row"><span>估值期</span><span>{data.latest_valuation?.report_period || "-"}</span></div>
            <div className="detail-row"><span>当前市值</span><span>{numberText(data.latest_valuation?.current_market_value)}</span></div>
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
  const latest = rows.length ? rows[rows.length - 1] : null;

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

  function toggleVisibleMa(key: MaKey) {
    setVisibleMas((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  return (
    <WorkbenchCard>
      <div className="stock-detail-panel stock-kline-panel">
        <div className="stock-detail-panel-toolbar stock-kline-toolbar">
          <div className="stock-kline-toolbar-title">
            <span>日线行情</span>
            <StockKlineMaLegend visibleMas={visibleMas} onToggleMa={toggleVisibleMa} />
          </div>
          <Space size={12} wrap>
            {latest ? <StockKlineLatestSummary latest={latest} /> : null}
            <Button size="small" type="primary" loading={loading} onClick={() => loadBars(true)}>刷新行情</Button>
          </Space>
        </div>
        <div className="stock-detail-panel-section first">
          {error ? (
            <EmptyAction description={`行情数据加载失败：${error}`} />
          ) : rows.length && latest ? (
            <DailyBarChart rows={rows} visibleMas={visibleMas} />
          ) : (
            <EmptyAction description={loading ? "行情加载中" : "暂无行情数据"} />
          )}
        </div>
      </div>
    </WorkbenchCard>
  );
}

function StockKlineMaLegend({ visibleMas, onToggleMa }: { visibleMas: MaKey[]; onToggleMa: (key: MaKey) => void }) {
  return (
    <div className="stock-kline-legend">
      {(Object.keys(maSeriesConfig) as MaKey[]).map((key) => (
        <button
          key={key}
          type="button"
          className={`stock-kline-legend-button ${visibleMas.includes(key) ? "active" : ""}`}
          aria-pressed={visibleMas.includes(key)}
          onClick={() => onToggleMa(key)}
        >
          <i style={{ backgroundColor: maSeriesConfig[key].color }} />
          {maSeriesConfig[key].label}
        </button>
      ))}
    </div>
  );
}

function StockKlineLatestSummary({ latest }: { latest: StockDailyBar }) {
  return (
    <div className="stock-kline-latest-summary">
      <span>
        最新涨幅：
        <strong className={stockKlineChangeClass(latest.pct_chg)}>{stockKlinePctText(latest.pct_chg)}</strong>
      </span>
      <span>
        最新价格：
        <strong>{stockKlineLatestSummary(latest.close)}</strong>
      </span>
      <span>
        更新时间：
        <strong>{latest.trade_date || "-"}</strong>
      </span>
    </div>
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

function ScoresTab({ data }: { data: StockDetail }) {
  const { resolvedMode } = useLiuliTheme();
  const [trendMetric, setTrendMetric] = useState<ScoreTrendMetric>(DEFAULT_SCORE_TREND_METRIC);
  const scoreColumns: ColumnsType<StockScoreSnapshot> = [
    { title: "报告时间", dataIndex: "report_time", width: 110 },
    { title: "研究员", dataIndex: "researcher_code", width: 110, render: (value) => value || "-" },
    { title: "等级", dataIndex: "investment_level", width: 70, render: (value) => value || "-" },
    { title: "总分", dataIndex: "total_score", width: 80, render: (value) => numberText(value) },
    { title: "壁垒", dataIndex: "business_moat_score", width: 80, render: (value) => numberText(value) },
    { title: "管理", dataIndex: "management_score", width: 80, render: (value) => numberText(value) },
    { title: "治理", dataIndex: "governance_score", width: 80, render: (value) => numberText(value) },
    { title: "战略", dataIndex: "strategy_score", width: 80, render: (value) => numberText(value) },
    { title: "确定性", dataIndex: "certainty_score", width: 90, render: (value) => numberText(value) },
    { title: "成长", dataIndex: "growth_score", width: 80, render: (value) => numberText(value) },
    { title: "创建时间", dataIndex: "created_at", width: 160, render: formatTime }
  ];
  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <div className="stock-detail-panel-section first">
          <div className="stock-score-trend-header">
            <div className="stock-detail-subtitle">评分趋势</div>
            <Select
              size="small"
              value={trendMetric}
              options={SCORE_TREND_METRICS.map(({ value, label }) => ({ value, label }))}
              onChange={setTrendMetric}
              popupMatchSelectWidth={120}
            />
          </div>
          {data.score_history.length ? <InlineChart option={buildScoreTrendBarOption(data.score_history, trendMetric, resolvedMode)} /> : <EmptyAction description="暂无评分趋势" />}
          <Table rowKey="id" size="small" dataSource={data.score_history} columns={scoreColumns} pagination={{ defaultPageSize: 8 }} />
        </div>
      </div>
    </WorkbenchCard>
  );
}

function ValuationTab({ data }: { data: StockDetail }) {
  const { resolvedMode } = useLiuliTheme();
  const latest = data.latest_valuation ? buildLatestValuationSummary(data.latest_valuation) : null;
  const valuationColumns: ColumnsType<StockDetailValuationSnapshot> = [
    { title: "分析日", dataIndex: "analysis_date", width: 110, render: (value) => value || "-" },
    { title: "报告期", dataIndex: "report_period", width: 110, render: (value) => value || "-" },
    { title: "当前市值", dataIndex: "current_market_value", width: 120, render: (value) => numberText(value) },
    { title: "三年合理市值", dataIndex: "expected_market_value_3y", width: 130, render: (value) => numberText(value) },
    {
      title: "三年估值空间",
      dataIndex: "expectation_gap_rate",
      width: 120,
      render: (value) => <span className={`stock-valuation-gap ${valuationGapTone(value)}`}>{formatValuationGap(value)}</span>
    },
    { title: "模型", dataIndex: "primary_model", width: 110, render: valuationModelLabel },
    { title: "研究员", dataIndex: "researcher", width: 100, render: (value) => value || "-" }
  ];
  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <div className="stock-detail-panel-section first">
          {latest ? (
            <div className="stock-valuation-latest">
              <div className="stock-valuation-section-head">
                <div className="stock-detail-subtitle">最新估值</div>
                <span>{latest.analysisDate || "-"} · {latest.researcher || "未标注研究员"}</span>
              </div>
              <div className="stock-valuation-summary-grid">
                <div className="stock-valuation-summary-item">
                  <span>当前市值</span>
                  <strong>{numberText(latest.currentMarketValue)}</strong>
                </div>
                <div className="stock-valuation-summary-item featured">
                  <span>三年合理市值</span>
                  <strong>{numberText(latest.expectedMarketValue3y)}</strong>
                </div>
                <div className="stock-valuation-summary-item">
                  <span>三年估值空间</span>
                  <strong className={`stock-valuation-gap ${latest.gapTone}`}>{latest.gapText}</strong>
                </div>
                <div className="stock-valuation-summary-item">
                  <span>估值依据</span>
                  <strong>{latest.modelLabel}</strong>
                  <em>{latest.reportPeriod || "未标注报告期"}</em>
                </div>
              </div>
            </div>
          ) : <EmptyAction description="暂无最新估值" />}
          <div className="stock-valuation-chart-section">
            <div className="stock-detail-subtitle">市值对比趋势</div>
            {data.valuation_history.length ? <InlineChart option={buildValuationComparisonOption(data.valuation_history, resolvedMode)} /> : <EmptyAction description="暂无估值趋势" />}
          </div>
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
