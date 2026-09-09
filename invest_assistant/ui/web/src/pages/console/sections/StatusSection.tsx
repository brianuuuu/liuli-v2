import { Col, Row, Statistic } from "antd";
import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { getAiLogDailyUsage, getDataSources, getSystemStatus } from "../../../api/console";
import { useLiuliTheme } from "../../../app/theme";
import { ChartCard } from "../../../components/charts/ChartCard";
import { chartGridColor, chartTextColor } from "../../../components/charts/chartTheme";
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

  const axisText = chartTextColor(resolvedMode);
  const gridLine = chartGridColor(resolvedMode);
  // 卡片底色，用作堆叠段之间的 2px 间隙色
  const surface = resolvedMode === "dark" ? "#161b22" : "#ffffff";
  // 验证过的分类色槽 1/2（validate_palette.js 双模式全部通过）
  const seriesBlue = resolvedMode === "dark" ? "#3987e5" : "#2a78d6";
  const seriesOrange = resolvedMode === "dark" ? "#d95926" : "#eb6834";

  const axisBase = useMemo(
    () => ({
      xAxis: {
        type: "category" as const,
        data: days.map((item) => item.date.slice(5)),
        axisLine: { lineStyle: { color: gridLine } },
        axisTick: { show: false },
        axisLabel: { color: axisText, fontSize: 10 }
      },
      grid: { top: 36, left: 8, right: 12, bottom: 4, containLabel: true }
    }),
    [days, axisText, gridLine]
  );

  const tokenOption = useMemo<EChartsOption>(
    () => ({
      ...axisBase,
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: axisText, fontSize: 11 },
        data: ["输入 token", "输出 token"]
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: unknown) => Number(value ?? 0).toLocaleString("zh-CN")
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: gridLine } },
        axisLabel: { color: axisText, fontSize: 10, formatter: (value: number) => compactNumber(value) }
      },
      series: [
        {
          name: "输入 token",
          type: "bar",
          stack: "token",
          barMaxWidth: 18,
          itemStyle: { color: seriesBlue, borderColor: surface, borderWidth: 2 },
          data: days.map((item) => item.prompt_tokens)
        },
        {
          name: "输出 token",
          type: "bar",
          stack: "token",
          barMaxWidth: 18,
          itemStyle: { color: seriesOrange, borderColor: surface, borderWidth: 2, borderRadius: [3, 3, 0, 0] },
          data: days.map((item) => item.completion_tokens)
        }
      ]
    }),
    [axisBase, axisText, gridLine, seriesBlue, seriesOrange, surface, days]
  );

  const requestOption = useMemo<EChartsOption>(
    () => ({
      ...axisBase,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: unknown) => `${Number(value ?? 0).toLocaleString("zh-CN")} 次`
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: gridLine } },
        axisLabel: { color: axisText, fontSize: 10 }
      },
      series: [
        {
          name: "调用次数",
          type: "bar",
          barMaxWidth: 18,
          itemStyle: { color: seriesBlue, borderRadius: [3, 3, 0, 0] },
          data: days.map((item) => item.requests)
        }
      ]
    }),
    [axisBase, axisText, gridLine, seriesBlue, days]
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
