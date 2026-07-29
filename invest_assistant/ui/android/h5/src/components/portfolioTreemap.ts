import type { EChartsCoreOption } from "echarts/core";

export type PortfolioTreemapItem = {
  name: string;
  marketValue: number;
  weight?: number | null;
  currentPrice?: number | null;
  dayPct?: number | null;
};

type PortfolioTreemapTheme = "light" | "dark";

type TreemapDatum = {
  name: string;
  value: number;
  currentPrice?: number | null;
  dayPct?: number | null;
  label: {
    formatter: string;
    color: string;
  };
  itemStyle: {
    color: string;
  };
};

const TREEMAP_COLORS = {
  light: {
    up: ["#c75b5b", "#b94747", "#a73737"],
    down: ["#4f9a6a", "#3f8659", "#2f7149"],
    neutral: "#64748b"
  },
  dark: {
    up: ["#a94f4f", "#bd5a5a", "#cf6969"],
    down: ["#397451", "#478760", "#579b70"],
    neutral: "#475569"
  }
} as const;

function formatPrice(value?: number | null) {
  return value === null || value === undefined || !Number.isFinite(value) ? "--" : `¥${value.toFixed(2)}`;
}

function formatDayPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function colorForDayPct(value: number | null | undefined, theme: PortfolioTreemapTheme) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return TREEMAP_COLORS[theme].neutral;
  const level = Math.abs(value) >= 3 ? 2 : Math.abs(value) >= 1.5 ? 1 : 0;
  return value > 0 ? TREEMAP_COLORS[theme].up[level] : TREEMAP_COLORS[theme].down[level];
}

function labelForItem(item: PortfolioTreemapItem) {
  const weight = item.weight ?? 0;
  if (weight < 3) return item.name;
  if (weight < 8) return `${item.name}\n${formatDayPct(item.dayPct)}`;
  return `${item.name}\n${formatPrice(item.currentPrice)}\n${formatDayPct(item.dayPct)}`;
}

export function buildPortfolioTreemapOption(
  items: PortfolioTreemapItem[],
  theme: PortfolioTreemapTheme
): EChartsCoreOption {
  const data: TreemapDatum[] = items.map((item) => ({
    name: item.name,
    value: item.marketValue,
    currentPrice: item.currentPrice,
    dayPct: item.dayPct,
    label: {
      formatter: labelForItem(item),
      color: "#ffffff"
    },
    itemStyle: {
      color: colorForDayPct(item.dayPct, theme)
    }
  }));

  return {
    animationDuration: 260,
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      formatter: (params: { data: TreemapDatum }) => {
        const item = params.data;
        return `${item.name}\n现价 ${formatPrice(item.currentPrice)}\n今日 ${formatDayPct(item.dayPct)}`;
      }
    },
    series: [{
      type: "treemap",
      data,
      roam: false,
      nodeClick: false,
      sort: "desc",
      breadcrumb: { show: false },
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      label: {
        show: true,
        position: "inside",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 17,
        overflow: "truncate"
      },
      itemStyle: {
        borderColor: theme === "dark" ? "#17191d" : "#ffffff",
        borderWidth: 2,
        gapWidth: 2
      },
      emphasis: {
        itemStyle: {
          borderWidth: 2
        }
      }
    }]
  } as EChartsCoreOption;
}

