import { Alert, Button, Drawer, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { getReportContent } from "../../api/reports";
import { MarkdownViewer } from "../../components/common/MarkdownViewer";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { AdjustAdviceReviews } from "../../types/api";
import { buildAdviceReviewGroups, directionEffect, riskExcess } from "./adviceReviewPresentation";
import type { ReviewGroup, ReviewKind, ReviewRecord } from "./adviceReviewPresentation";

const signalLabels: Record<string, string> = {
  below_value_center: "价格低于价值中枢", above_value_center: "价格高于价值中枢",
  value_rank_mismatch: "调整持仓相对排序", concentration_risk: "降低持仓集中度",
  cash_rebalance: "调整现金与股票比例", value_impairment_risk: "应对价值受损风险",
  pullback_support: "回落后获得支撑", overextension: "应对短期上涨透支",
  sentiment_extreme: "应对极端市场情绪", unknown: "报告未标注主要原因"
};
const riskLabels: Record<string, string> = {
  kline_breakdown: "价格跌破关键支撑", value_trend_down: "年线趋势向下",
  relative_weakness: "走势明显弱于大盘", volatility_spike: "价格波动明显放大",
  negative_sentiment: "负面资讯或舆情", fundamental_deterioration: "经营基本面恶化",
  regulatory_legal: "监管或诉讼风险", shareholder_action: "股东行为风险",
  event_window: "重要事件的不确定性", unknown: "报告未标注风险类型"
};
const levelLabels: Record<string, string> = { none: "无警示", watch: "观察", warning: "警示", severe: "严重" };
const actionLabels: Record<string, string> = { add: "增持", reduce: "减持", hold: "维持", wait: "等待" };
const inclusionLabels: Record<ReviewRecord["inclusion"], string> = {
  counted: "计入统计", repeat: "连续重复建议，不重复计入", not_touched: "未触及参考价，不计入胜率",
  pending: "待评估", unknown: "历史明细不完整，样本归属以汇总为准"
};
const pct = (value: number) => `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

function ReturnValue({ value }: { value?: number | null }) {
  return value == null ? <span className="advice-review-muted">待补齐</span> : (
    <span style={{ color: value > 0 ? "var(--ll-up)" : value < 0 ? "var(--ll-down)" : undefined }}>{pct(value)}</span>
  );
}

function ReportReader({ record, onClose }: { record: ReviewRecord; onClose: () => void }) {
  const content = useAsyncData(useCallback(() => getReportContent(record.report.report_id!), [record.report.report_id]), "");
  return (
    <Drawer open onClose={onClose} size={860} title={`${record.report.target_trade_date} · 微操报告`}>
      {content.loading ? <Spin /> : content.error ? (
        <Alert type="warning" showIcon title="报告读取失败" action={<Button onClick={() => void content.refresh()}>重试</Button>} />
      ) : <MarkdownViewer content={content.data} />}
    </Drawer>
  );
}

function Assessment({ record, kind }: { record: ReviewRecord; kind: ReviewKind }) {
  const { item } = record;
  const verdict = kind === "signal" ? item.verdict : item.risk_verdict;
  if (verdict == null) return (
    <div className="advice-review-pending">待评估 · 需满20个交易日并补齐行情
      <small>若已满期，等待行情同步或评估任务更新。</small>
    </div>
  );
  if (kind === "risk") {
    const excess = riskExcess(item);
    return (
      <div>
        <strong>{verdict === "hit" ? "命中：明显跑输大盘" : "未命中：未达到跑输标准"}</strong>
        <div className="advice-review-muted">{excess == null ? "相对收益数据未提供" : `相对沪深300${excess < 0 ? "落后" : "领先"}${Math.abs(excess * 100).toFixed(2)}个百分点`}</div>
      </div>
    );
  }
  const effect = directionEffect(item);
  return (
    <div>
      <strong>{({ correct: "方向有利", wrong: "方向不利", neutral: "方向持平" } as Record<string, string>)[verdict] || verdict}</strong>
      {item.return_20d != null ? <div className="advice-review-muted">
        建议后20日{item.return_20d >= 0 ? "上涨" : "下跌"}{Math.abs(item.return_20d * 100).toFixed(2)}%
        {item.action === "reduce" && item.return_20d !== 0 ? `，减持${item.return_20d > 0 ? "会错过上涨" : "可避开下跌"}` : ""}
      </div> : null}
      <div>方向效果 <ReturnValue value={effect} /></div>
    </div>
  );
}

function ReviewRecords({ group, kind, complete, onOpenReport }: {
  group: ReviewGroup; kind: ReviewKind; complete: boolean; onOpenReport: (record: ReviewRecord) => void;
}) {
  const columns: ColumnsType<ReviewRecord> = [
    {
      title: "日期与股票", key: "stock", width: 158,
      render: (_, record) => <div className="advice-review-stack">
        <strong>{record.item.stock_name}</strong><span className="advice-review-muted">{record.item.stock_code}</span>
        <span>{record.report.target_trade_date}</span><small className="advice-review-muted">适用交易日</small>
        {record.report.report_id ? <Button type="link" size="small" onClick={() => onOpenReport(record)}>查看原报告</Button> : <small className="advice-review-muted">未关联原报告</small>}
      </div>
    },
    {
      title: kind === "signal" ? "当时建议与理由" : "当时风险与处理建议", key: "reason",
      render: (_, { item, latestRisk }: ReviewRecord) => <div className="advice-review-reason">
        <div className="advice-review-line">
          <Tag>{actionLabels[item.action] || item.action}{kind === "signal" && item.quantity != null ? ` ${number(item.quantity)}股` : ""}</Tag>
          {kind === "signal" && item.rating ? <span className="advice-rating">{"★".repeat(Math.min(5, Math.max(0, item.rating)))}</span> : null}
          {kind === "risk" ? <Tag color={item.risk_level === "severe" ? "red" : "orange"}>{levelLabels[item.risk_level] || item.risk_level}</Tag> : null}
        </div>
        {kind === "signal" ? <div>参考价格：{item.price_low == null || item.price_high == null ? "报告未提供" : `${number(item.price_low)}—${number(item.price_high)}元`}</div> : (
          <p>{item.risk_summary || "报告未提供风险摘要"}</p>
        )}
        <Typography.Paragraph ellipsis={{ rows: 3, expandable: true, symbol: "展开完整理由与条件" }} style={{ marginBottom: 6 }}>
          {item.core_logic || "报告未提供核心理由"}
        </Typography.Paragraph>
        {item.history_note ? <details><summary>历史建议与执行背景</summary><p>{item.history_note}</p></details> : null}
        {kind === "risk" && latestRisk ? <div className="advice-review-followup">
          后续跟踪 · {latestRisk.date}：{levelLabels[item.risk_level] || item.risk_level} → {levelLabels[latestRisk.level] || latestRisk.level}
          <small>后续级别变化不改变本次警示的事后评估。</small>
        </div> : null}
      </div>
    },
    {
      title: kind === "signal" ? "触价与实际执行" : "警示后20日表现", key: "progress", width: 210,
      render: (_, { item }: ReviewRecord) => kind === "signal" ? <div className="advice-review-stack">
        <span>价格：{item.trigger_status === "touched" ? "已触及参考价" : item.trigger_status === "not_touched" ? "未触及参考价" : "待核验"}</span>
        <span>执行：{({ executed: "已执行", partial: "部分执行", not_executed: "未执行" } as Record<string, string>)[item.execution_status || ""] || "待核验"}
          {item.executed_quantity != null ? ` · ${number(item.executed_quantity)}股` : ""}</span>
        <small className="advice-review-muted">触价仅检查价格，不代表报告中的完整条件满足或实际成交。</small>
      </div> : <div className="advice-review-stack">
        <span>个股 <ReturnValue value={item.return_20d} /></span>
        <span>沪深300 <ReturnValue value={item.benchmark_return_20d} /></span>
        <span>相对差值 {riskExcess(item) == null ? "待补齐" : `${(riskExcess(item)! * 100).toFixed(2)}个百分点`}</span>
      </div>
    },
    {
      title: "评估结果", key: "assessment", width: 250,
      render: (_, record) => <div className="advice-review-stack">
        <Assessment record={record} kind={kind} />
        {kind === "signal" ? <>
          <div className="advice-review-returns">个股涨跌：5日 <ReturnValue value={record.item.return_5d} /> · 20日 <ReturnValue value={record.item.return_20d} /> · 60日 <ReturnValue value={record.item.return_60d} /></div>
          <small className="advice-review-muted">{inclusionLabels[record.inclusion]}</small>
        </> : null}
      </div>
    }
  ];
  return (
    <div className="advice-review-records">
      <div className="advice-review-caption">
        {complete ? "相关报告记录" : "近期相关报告记录"} {group.records.length} 条
        {kind === "signal" ? " · 含待评估、未触价和连续跟踪记录，条数不等于已评估样本数" : " · 每条警示独立评估，可能包含同一股票的连续跟踪"}
      </div>
      <Table<ReviewRecord> className="advice-review-detail-table" rowKey="key" size="small" columns={columns} dataSource={group.records}
        pagination={{ defaultPageSize: 5, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{ emptyText: "返回的报告中没有该分类明细；上方仍显示全部历史统计。" }} />
    </div>
  );
}

/** 分类汇总始终采用后台全量统计；展开只展示现有接口返回的报告，不伪造缺失字段。 */
export function AdviceStatsReview({ data, kind, loading = false }: { data: AdjustAdviceReviews; kind: ReviewKind; loading?: boolean }) {
  const { groups, complete } = useMemo(() => buildAdviceReviewGroups(data, kind), [data, kind]);
  const [openedReport, setOpenedReport] = useState<ReviewRecord | null>(null);
  const label = (group: ReviewGroup) => (kind === "signal" ? signalLabels : riskLabels)[group.code] || group.code;
  const columns: ColumnsType<ReviewGroup> = [
    {
      title: kind === "signal" ? "调仓方向与主要原因" : "风险类型", key: "reason",
      render: (_, row) => <div className="advice-review-stack">
        <span>{row.action ? <Tag color={row.action === "add" ? "red" : "green"}>{actionLabels[row.action] || row.action}</Tag> : null}{label(row)}</span>
        <small className="advice-review-muted">{row.code === "concentration_risk" ? "以分散仓位为目的；方向效果不代表整体风控效果" : kind === "signal" ? "按报告标注的主要理由归类" : "按报告标注的主要风险归类"}</small>
      </div>
    },
    {
      title: complete ? "涉及股票" : "近期涉及股票", key: "stocks",
      render: (_, row) => <div className="advice-review-stocks">{row.stocks.length ? row.stocks.map((stock) => <span key={stock.id}>{stock.name}<small>{stock.code}</small></span>) : <span className="advice-review-muted">近期明细未覆盖</span>}</div>
    },
    {
      title: "已评估样本", dataIndex: "samples", width: 125, align: "right",
      render: (value: number) => <div>{value} 条{value > 0 && value < 10 ? <small className="advice-review-thin">样本不足10条</small> : null}</div>
    },
    { title: complete ? "待评估记录" : "近期待评估记录", dataIndex: "pending", width: 135, align: "right", render: (value: number) => `${value} 条` },
    {
      title: kind === "signal" ? "20日方向结果" : "20日验证结果", key: "result", width: 180,
      render: (_, row) => !row.samples ? <span className="advice-review-muted">暂无评估结果</span> : kind === "signal" ? (
        <span>有利 {row.correct} · 不利 {row.wrong}<br />持平 {row.neutral}</span>
      ) : <span>命中 {row.hits} · 未命中 {row.samples - row.hits}</span>
    },
    { title: kind === "signal" ? "正确率" : "命中率", dataIndex: "rate", width: 90, align: "right", render: (value: number | null) => value == null ? "待积累" : `${(value * 100).toFixed(1)}%` }
  ];
  if (kind === "signal") columns.push({ title: "20日平均方向效果", dataIndex: "avgEffect", width: 156, align: "right", render: (value: number | null) => value == null ? "待积累" : <ReturnValue value={value} /> });
  return (
    <div className="advice-stats-review">
      <div className="advice-review-caption">
        {kind === "signal" ? "看不同调仓理由的历史效果；展开可核对股票、当时条件和事后表现。方向效果以适用日收盘为基准，不是账户实际盈亏。" : "看历史警示是否应验；警示后20日跑输沪深300超过3个百分点，计为命中。"}
        {!complete ? <strong className="advice-review-scope">统计涵盖全部 {data.summary.report_count} 份报告；股票、待评估记录与明细仅覆盖最近 {data.reports.length} 份。</strong> : null}
      </div>
      <Table<ReviewGroup> rowKey="key" className="advice-review-summary-table" size="small" columns={columns} dataSource={groups} loading={loading}
        pagination={false} locale={{ emptyText: kind === "signal" ? "暂无调仓建议；新建议导入后即可查看，满20个交易日后评估。" : "暂无警示或严重风险记录；观察级别不计入命中率。" }}
        expandable={{
          expandedRowRender: (group) => <ReviewRecords group={group} kind={kind} complete={complete} onOpenReport={setOpenedReport} />,
          columnWidth: 90, columnTitle: "明细",
          expandIcon: ({ expanded, onExpand, record }) => <Button size="small" type="link" aria-expanded={expanded} aria-label={`${expanded ? "收起" : "查看"}${label(record)}记录`} onClick={(event) => onExpand(record, event)}>{expanded ? "收起" : "查看记录"}</Button>
        }} />
      {openedReport ? <ReportReader key={openedReport.report.report_id} record={openedReport} onClose={() => setOpenedReport(null)} /> : null}
    </div>
  );
}
