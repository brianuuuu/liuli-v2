import type { EChartsCoreOption } from "echarts/core";

export type PortfolioTreemapItem = {
  name: string;
  marketValue: number;
  weight?: number | null;
  dayPct?: number | null;
};

export type PortfolioTreemapTheme = "light" | "dark";

/** 块排好后的可用尺寸（已扣掉描边），按数据下标作 id 对应。 */
export type TreemapRect = { width: number; height: number };

type TreemapLabel = {
  show: boolean;
  formatter?: string;
  fontSize?: number;
  lineHeight?: number;
};

type TreemapDatum = {
  id: string;
  name: string;
  value: number;
  dayPct?: number | null;
  label: TreemapLabel & {
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

function formatWeight(value?: number | null) {
  return value === null || value === undefined || !Number.isFinite(value) ? "--" : `${value.toFixed(1)}%`;
}

function formatDayPct(value?: number | null, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function colorForDayPct(value: number | null | undefined, theme: PortfolioTreemapTheme) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return TREEMAP_COLORS[theme].neutral;
  const level = Math.abs(value) >= 3 ? 2 : Math.abs(value) >= 1.5 ? 1 : 0;
  return value > 0 ? TREEMAP_COLORS[theme].up[level] : TREEMAP_COLORS[theme].down[level];
}

/** 块越小字越少；组合视角下仓位占比比现价有用，大块写占比不写现价。还没排版、拿不到块尺寸时按占比估。 */
function labelForItem(item: PortfolioTreemapItem): TreemapLabel {
  const weight = item.weight ?? 0;
  if (weight < 3) return { show: true, formatter: item.name };
  if (weight < 8) return { show: true, formatter: `${item.name}\n${formatDayPct(item.dayPct)}` };
  return { show: true, formatter: `${item.name}\n${formatWeight(item.weight)}\n${formatDayPct(item.dayPct)}` };
}

const LABEL_FONT_SIZES = [12, 11, 10];
// 文字内边距写进配置（ECharts 默认 5px），排字估算用同一组值，两边才对得上
const LABEL_PADDING_X = 3;
const LABEL_PADDING_Y = 4;

/**
 * 估一行加粗字宽（单位：字号）：中文一个字号，数字约 0.62，小数点约 0.32，百分号约 0.95，其余半角约 0.65。
 * 手机字体各家不同，宁可估宽：估窄了字会被截成"…"，估宽了只是换一种更省地方的排法。
 */
function textWidth(text: string, fontSize: number) {
  let em = 0;
  for (const char of text) {
    if (/[0-9]/.test(char)) em += 0.62;
    else if (char === ".") em += 0.32;
    else if (char === "%") em += 0.95;
    else em += char.charCodeAt(0) < 0x2000 ? 0.65 : 1;
  }
  return em * fontSize;
}

/** 名字对半拆成两行，窄块里四个字的名字也能完整放下。 */
function splitName(name: string): string[] {
  const chars = [...name];
  if (chars.length < 3) return [name];
  const half = Math.ceil(chars.length / 2);
  return [chars.slice(0, half).join(""), chars.slice(half).join("")];
}

/**
 * 按块实际排出来的尺寸排字。只看占比猜块大小不准：扁长块会切掉第三行，窄块会把名字截成"佳驰…"。
 * 按信息量从多到少挑第一种放得下的排法，同一种排法先试大字号：
 * 名称+占比+涨跌 → 名称+涨跌 → 名称拆两行+涨跌 → 涨跌缩成一位小数 → 只留名称 → 名称拆两行；
 * 都放不下就只留名称交给截断，连一行都放不下就不写字。
 */
export function fitTreemapLabel(item: PortfolioTreemapItem, rect: TreemapRect): TreemapLabel {
  const width = rect.width - LABEL_PADDING_X * 2;
  const height = rect.height - LABEL_PADDING_Y * 2;
  const day = formatDayPct(item.dayPct);
  const shortDay = formatDayPct(item.dayPct, 1);
  const nameLines = splitName(item.name);
  const splitable = nameLines.length > 1;
  const layouts = [
    ...(item.weight === null || item.weight === undefined ? [] : [[item.name, formatWeight(item.weight), day]]),
    [item.name, day],
    ...(splitable ? [[...nameLines, day]] : []),
    [item.name, shortDay],
    ...(splitable ? [[...nameLines, shortDay]] : []),
    [item.name],
    ...(splitable ? [nameLines] : [])
  ];
  for (const lines of layouts) {
    for (const fontSize of LABEL_FONT_SIZES) {
      const lineHeight = Math.round(fontSize * 1.4);
      if (lines.length * lineHeight <= height && lines.every((line) => textWidth(line, fontSize) <= width)) {
        return { show: true, formatter: lines.join("\n"), fontSize, lineHeight };
      }
    }
  }
  const smallest = LABEL_FONT_SIZES[LABEL_FONT_SIZES.length - 1];
  const smallestLineHeight = Math.round(smallest * 1.4);
  return height >= smallestLineHeight
    ? { show: true, formatter: item.name, fontSize: smallest, lineHeight: smallestLineHeight }
    : { show: false };
}

export function buildPortfolioTreemapOption(
  items: PortfolioTreemapItem[],
  theme: PortfolioTreemapTheme,
  rects?: ReadonlyMap<string, TreemapRect>
): EChartsCoreOption {
  const data: TreemapDatum[] = items.map((item, index) => {
    const id = String(index);
    const rect = rects?.get(id);
    return {
      id,
      name: item.name,
      value: item.marketValue,
      dayPct: item.dayPct,
      label: {
        ...(rect ? fitTreemapLabel(item, rect) : labelForItem(item)),
        color: "#ffffff"
      },
      itemStyle: {
        color: colorForDayPct(item.dayPct, theme)
      }
    };
  });

  return {
    animationDuration: 260,
    series: [{
      type: "treemap",
      data,
      // 纯展示：块上已写名称和涨跌，不吃触摸，手指从图上起手也能横滑切页签
      silent: true,
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
        padding: [LABEL_PADDING_Y, LABEL_PADDING_X],
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
