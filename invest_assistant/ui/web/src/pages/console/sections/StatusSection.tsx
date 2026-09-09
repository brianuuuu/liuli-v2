import { Col, Row, Statistic } from "antd";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { getAiLogDailyUsage, getDataSources, getSystemStatus } from "../../../api/console";
import { useLiuliTheme } from "../../../app/theme";
import { ChartCard } from "../../../components/charts/ChartCard";
import { chartGridColor } from "../../../components/charts/chartTheme";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";

const USAGE_DAYS = 14;

const HEALTH_TEXT: Record<string, string> = {
  ok: "正常",
  error: "异常",
  unknown: "未知"
};

const MCP_TEXT: Record<string, string> = {
  ok: "正常",
  disabled: "已停用",
  not_configured: "未配置",
  unknown: "未知"
};

function healthColor(value: string, mode: "light" | "dark") {
  if (value === "ok") return mode === "dark" ? "#3fb950" : "#16a34a";
  if (value === "unknown" || value === "not_configured") return "var(--ll-muted)";
  return mode === "dark" ? "#f85149" : "#dc2626";
}

function compactNumber(value: number) {
  const trim = (num: number) => String(Number(num.toFixed(1)));
  if (Math.abs(value) >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `${trim(value / 1_000)}k`;
  return String(value);
}

function CardNote({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 6, fontSize: 12, color: "var(--ll-muted)", lineHeight: 1.5 }}>{children}</div>;
}

type TooltipRow = { color: string; seriesName: string; value: number; axisValue: string };

export function StatusSection() {
  const { resolvedMode } = useLiuliTheme();
  const status = useAsyncData(useCallback(getSystemStatus, []), {
    api: "unknown",
    database: "unknown",
    mcp: { status: "unknown", clients: 0, enabled_clients: 0, tools: 0, debug_log: "unknown" }
  });
  const dataSources = useAsyncData(useCallback(getDataSources, []), []);
  const usage = useAsyncData(useCallback(() => getAiLogDailyUsage(USAGE_DAYS), []), []);

  const mcp = status.data.mcp;
  const days = usage.data;
  const totalTokens = days.reduce((sum, item) => sum + item.total_tokens, 0);
  const totalRequests = days.reduce((sum, item) => sum + item.requests, 0);

  const dark = resolvedMode === "dark";
  const gridLine = chartGridColor(resolvedMode);
  const axisText = dark ? "#8b949e" : "#64748b";
  const strongText = dark ? "#e6edf3" : "#0f172a";
  // 卡片底色：堆叠段之间的间隙用底色挖出来，而不是给柱子描一圈对比色边
  const surface = dark ? "#161b22" : "#ffffff";
  // 验证过的分类色槽 1/2（validate_palette.js 明暗双模式六项全过）
  const seriesBlue = dark ? "#3987e5" : "#2a78d6";
  const seriesOrange = dark ? "#d95926" : "#eb6834";

  // 提示框跟随主题，暗色下不再是白底
  const tooltipBase = useMemo(
    () => ({
      backgroundColor: dark ? "#21262d" : "#ffffff",
      borderColor: dark ? "rgba(255,255,255,0.12)" : "#e2e8f0",
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: strongText, fontSize: 12 },
      extraCssText: `border-radius:7px;box-shadow:0 6px 20px ${dark ? "rgba(0,0,0,0.45)" : "rgba(15,23,42,0.10)"};`
    }),
    [dark, strongText]
  );

  // 数值是主角、系列名是配角；系列用一小段线标识而不是实心色块
  const renderTooltip = useCallback(
    (params: unknown, withTotal: boolean) => {
      const list = (Array.isArray(params) ? params : [params]) as TooltipRow[];
      if (!list.length) return "";
      const divider = dark ? "rgba(255,255,255,0.10)" : "#e2e8f0";
      const key = (color: string) =>
        `<span style="display:inline-block;width:10px;height:2px;border-radius:1px;background:${color};margin-right:8px;vertical-align:middle"></span>`;
      const row = (color: string, name: string, value: number) =>
        `<div style="display:flex;align-items:center;line-height:22px">${key(color)}` +
        `<span style="color:${axisText}">${name}</span>` +
        `<span style="margin-left:auto;padding-left:24px;font-weight:600;color:${strongText}">${value.toLocaleString("zh-CN")}</span></div>`;
      const total = list.reduce((sum, item) => sum + Number(item.value || 0), 0);
      return (
        `<div style="min-width:150px">` +
        `<div style="color:${axisText};margin-bottom:2px">${list[0].axisValue}</div>` +
        list.map((item) => row(item.color, item.seriesName, Number(item.value || 0))).join("") +
        (withTotal
          ? `<div style="display:flex;line-height:22px;margin-top:4px;padding-top:4px;border-top:1px solid ${divider}">` +
            `<span style="color:${axisText}">合计</span>` +
            `<span style="margin-left:auto;padding-left:24px;font-weight:600;color:${strongText}">${total.toLocaleString("zh-CN")}</span></div>`
          : "") +
        `</div>`
      );
    },
    [axisText, strongText, dark]
  );

  const xAxisBase = useMemo(
    () => ({
      type: "category" as const,
      data: days.map((item) => item.date.slice(5)),
      axisLine: { lineStyle: { color: gridLine } },
      axisTick: { show: false },
      axisLabel: { color: axisText, fontSize: 10, margin: 10 }
    }),
    [days, axisText, gridLine]
  );

  const yAxisBase = useMemo(
    () => ({
      type: "value" as const,
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridLine } }
    }),
    [gridLine]
  );

  const tokenOption = useMemo<EChartsOption>(
    () => ({
      xAxis: xAxisBase,
      yAxis: {
        ...yAxisBase,
        axisLabel: { color: axisText, fontSize: 10, formatter: (value: number) => compactNumber(value) }
      },
      grid: { top: 42, left: 8, right: 12, bottom: 4, containLabel: true },
      legend: {
        top: 2,
        left: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 16,
        icon: "roundRect",
        textStyle: { color: axisText, fontSize: 11 },
        data: ["输入 token", "输出 token"]
      },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: dark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)" }
        },
        formatter: (params: unknown) => renderTooltip(params, true)
      },
      series: [
        {
          name: "输入 token",
          type: "bar",
          stack: "token",
          barMaxWidth: 22,
          itemStyle: { color: seriesBlue, borderColor: surface, borderWidth: 2 },
          emphasis: { itemStyle: { opacity: 0.85 } },
          data: days.map((item) => item.prompt_tokens)
        },
        {
          name: "输出 token",
          type: "bar",
          stack: "token",
          barMaxWidth: 22,
          itemStyle: { color: seriesOrange, borderColor: surface, borderWidth: 2, borderRadius: [4, 4, 0, 0] },
          emphasis: { itemStyle: { opacity: 0.85 } },
          data: days.map((item) => item.completion_tokens)
        }
      ]
    }),
    [xAxisBase, yAxisBase, axisText, seriesBlue, seriesOrange, surface, days, tooltipBase, renderTooltip, dark]
  );

  const requestOption = useMemo<EChartsOption>(
    () => ({
      xAxis: xAxisBase,
      yAxis: { ...yAxisBase, axisLabel: { color: axisText, fontSize: 10 } },
      grid: { top: 18, left: 8, right: 12, bottom: 4, containLabel: true },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: gridLine, width: 1 } },
        formatter: (params: unknown) => renderTooltip(params, false)
      },
      series: [
        {
          name: "调用次数",
          type: "line",
          smooth: false,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { color: seriesBlue, width: 2, cap: "round", join: "round" },
          // 端点带 2px 底色描环，交叠处仍然清晰
          itemStyle: { color: seriesBlue, borderColor: surface, borderWidth: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: dark ? "rgba(57,135,229,0.22)" : "rgba(42,120,214,0.16)" },
                { offset: 1, color: dark ? "rgba(57,135,229,0)" : "rgba(42,120,214,0)" }
              ]
            }
          },
          data: days.map((item) => item.requests)
        }
      ]
    }),
    [xAxisBase, yAxisBase, axisText, gridLine, seriesBlue, surface, days, tooltipBase, renderTooltip, dark]
  );

  return (
    <>
      <Row gutter={[12, 12]}>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic
              title="接口服务"
              value={HEALTH_TEXT[status.data.api] || status.data.api}
              valueStyle={{ color: healthColor(status.data.api, resolvedMode) }}
              loading={status.loading}
            />
            <CardNote>后端 API 可用性</CardNote>
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic
              title="数据库"
              value={HEALTH_TEXT[status.data.database] || status.data.database}
              valueStyle={{ color: healthColor(status.data.database, resolvedMode) }}
              loading={status.loading}
            />
            <CardNote>连接探测 SELECT 1</CardNote>
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic
              title="MCP 服务"
              value={MCP_TEXT[mcp.status] || mcp.status}
              valueStyle={{ color: healthColor(mcp.status, resolvedMode) }}
              loading={status.loading}
            />
            <CardNote>
              已启用客户端 {mcp.enabled_clients} / 共 {mcp.clients} · 可用工具 {mcp.tools} 个
            </CardNote>
          </WorkbenchCard>
        </Col>
        <Col span={6}>
          <WorkbenchCard>
            <Statistic title="数据源" value={dataSources.data.length} suffix="个" loading={dataSources.loading} />
            <CardNote>已接入的行情与资讯采集源</CardNote>
          </WorkbenchCard>
        </Col>
      </Row>
      <Row gutter={[12, 12]}>
        <Col span={12}>
          <ChartCard
            title={`近 ${USAGE_DAYS} 天 Token 用量`}
            extra={
              <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                合计 {totalTokens.toLocaleString("zh-CN")}
              </span>
            }
            option={tokenOption}
            height={240}
          />
        </Col>
        <Col span={12}>
          <ChartCard
            title={`近 ${USAGE_DAYS} 天 AI 调用次数`}
            extra={
              <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                合计 {totalRequests.toLocaleString("zh-CN")} 次
              </span>
            }
            option={requestOption}
            height={240}
          />
        </Col>
      </Row>
    </>
  );
}
