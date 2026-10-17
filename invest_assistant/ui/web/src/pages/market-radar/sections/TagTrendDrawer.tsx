import { Drawer, Segmented, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getTagTrend, type RankingWindow } from "../../../api/marketRadar";
import { useLiuliTheme } from "../../../app/theme";
import { EmptyAction } from "../../../components/common/EmptyAction";
import type { TagHeat } from "../../../types/api";
import { formatTime, trendLineOption, trendSummary, windowOptions } from "./shared";

type TagTrendDrawerProps = {
  open: boolean;
  title: string;
  tagId: number | null;
  defaultWindow: RankingWindow;
  typeTag?: ReactNode;
  onClose: () => void;
};

export function TagTrendDrawer({ open, title, tagId, defaultWindow, typeTag, onClose }: TagTrendDrawerProps) {
  const { resolvedMode } = useLiuliTheme();
  const [timeWindow, setTimeWindow] = useState<RankingWindow>(defaultWindow);
  const [trend, setTrend] = useState<TagHeat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setTimeWindow(defaultWindow);
  }, [open, tagId, defaultWindow]);

  useEffect(() => {
    if (!open || tagId == null) {
      setTrend([]);
      return;
    }
    let cancelled = false;
    setTrend([]);
    setLoading(true);
    getTagTrend(tagId, timeWindow)
      .then((rows) => {
        if (!cancelled) setTrend(rows);
      })
      .catch(() => {
        if (!cancelled) setTrend([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tagId, timeWindow]);

  const summary = useMemo(() => trendSummary(trend), [trend]);
  const option = useMemo(() => trendLineOption(trend, resolvedMode, timeWindow), [trend, resolvedMode, timeWindow]);

  return (
    <Drawer
      title={
        <div className="tag-trend-title">
          <span>{title}</span>
          {typeTag}
        </div>
      }
      open={open}
      onClose={onClose}
      size={720}
      destroyOnHidden
      className="tag-trend-drawer"
    >
      <div className="tag-trend-toolbar">
        <span className="tag-trend-caption">热度窗口</span>
        <Segmented
          size="small"
          value={timeWindow}
          options={windowOptions}
          onChange={(value) => setTimeWindow(value as RankingWindow)}
        />
      </div>

      <div className="tag-trend-stats">
        <TrendStat label="最新热度" value={summary ? summary.latest.toFixed(1) : "-"} />
        <TrendStat label="当前排名" value={summary?.rank ? `#${summary.rank}` : "-"} />
        <TrendStat label="区间峰值" value={summary ? summary.peak.toFixed(1) : "-"} />
        <TrendStat
          label="区间变化"
          value={summary?.changePct == null ? "-" : `${summary.changePct > 0 ? "+" : ""}${summary.changePct.toFixed(1)}%`}
          tone={summary?.changePct == null || summary.changePct === 0 ? undefined : summary.changePct > 0 ? "up" : "down"}
        />
      </div>

      <div className="tag-trend-chart">
        <div className="tag-trend-chart-head">
          <span>历史热度</span>
          {summary ? (
            <span className="tag-trend-caption">
              {formatTime(summary.from).slice(0, 16)} ~ {formatTime(summary.to).slice(0, 16)} · {trend.length} 个快照
            </span>
          ) : null}
        </div>
        <Spin spinning={loading}>
          {trend.length ? (
            <ReactECharts option={option} style={{ height: 320, width: "100%" }} notMerge />
          ) : (
            <div className="tag-trend-empty">
              {loading ? null : <EmptyAction description={tagId == null ? "该热词未绑定标签词" : "该窗口暂无趋势数据"} />}
            </div>
          )}
        </Spin>
      </div>
    </Drawer>
  );
}

function TrendStat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="tag-trend-stat">
      <span>{label}</span>
      <strong className={tone ? `track-change ${tone}` : undefined}>{value}</strong>
    </div>
  );
}
