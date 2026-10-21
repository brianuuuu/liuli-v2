import { Tooltip } from "antd";
import type { PortfolioReviewCalendarItem } from "../../types/api";

type Cell = { key: string; label: string; value: number | null } | null;

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/**
 * 按周期排成方格：当月按星期 7 列，当年 4×3 个月，全部按年。
 * 后端只给有数据的格子，这里补齐整月 / 整年，非交易日和无数据的格子留空。
 */
function buildCells(granularity: string, items: PortfolioReviewCalendarItem[]): { columns: number; header?: string[]; cells: Cell[] } {
  const values = new Map(items.map((item) => [item.key, item.return_pct ?? null]));
  const first = items[0]?.key;
  if (granularity === "day" && first) {
    const month = first.slice(0, 7);
    const [year, monthIndex] = month.split("-").map(Number);
    const days = new Date(year, monthIndex, 0).getDate();
    const offset = (new Date(year, monthIndex - 1, 1).getDay() + 6) % 7;
    const cells: Cell[] = Array.from({ length: offset }, () => null);
    for (let day = 1; day <= days; day += 1) {
      const key = `${month}-${String(day).padStart(2, "0")}`;
      cells.push({ key, label: String(day), value: values.get(key) ?? null });
    }
    return { columns: 7, header: WEEKDAYS, cells };
  }
  if (granularity === "month" && first) {
    const year = first.slice(0, 4);
    const cells = Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, "0")}`;
      return { key, label: `${index + 1}月`, value: values.get(key) ?? null };
    });
    return { columns: 4, cells };
  }
  return { columns: 4, cells: items.map((item) => ({ key: item.key, label: item.label, value: item.return_pct ?? null })) };
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function toneClass(value: number) {
  return value > 0 ? "is-up" : value < 0 ? "is-down" : undefined;
}

/** 红涨绿跌，按本期最大绝对值定深浅；颜色带透明度，浅色、深色主题都落在卡片底色上 */
function cellStyle(value: number | null, maxAbs: number) {
  if (value === null || value === 0) return undefined;
  const strength = Math.min(1, Math.abs(value) / maxAbs);
  const alpha = 0.14 + strength * 0.62;
  return {
    background: value > 0 ? `rgba(220, 38, 38, ${alpha})` : `rgba(5, 150, 105, ${alpha})`,
    color: alpha > 0.5 ? "#fff" : undefined
  };
}

export function PnlCalendar({ granularity, items }: { granularity: string; items: PortfolioReviewCalendarItem[] }) {
  const { columns, header, cells } = buildCells(granularity, items);
  const filled = items.map((item) => item.return_pct).filter((value): value is number => value !== null && value !== undefined);
  const maxAbs = Math.max(0.01, ...filled.map((value) => Math.abs(value)));
  const unit = granularity === "day" ? "天" : granularity === "year" ? "年" : "月";
  const up = filled.filter((value) => value > 0).length;
  const down = filled.filter((value) => value < 0).length;
  return (
    <div className="pnl-calendar">
      {header ? (
        <div className="pnl-calendar-header" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {header.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <div className={`pnl-calendar-grid pnl-calendar-grid--${granularity}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {cells.map((cell, index) =>
          cell ? (
            <Tooltip key={cell.key} title={cell.value === null ? `${cell.key} 无记录` : `${cell.key} 盈亏率 ${signedPercent(cell.value)}`}>
              <div className={cell.value === null ? "pnl-calendar-cell is-empty" : "pnl-calendar-cell"} style={cellStyle(cell.value, maxAbs)}>
                <span className="pnl-calendar-cell-label">{cell.label}</span>
                {cell.value === null ? null : <span className="pnl-calendar-cell-value">{signedPercent(cell.value)}</span>}
              </div>
            </Tooltip>
          ) : (
            <div key={`blank-${index}`} className="pnl-calendar-cell is-blank" />
          )
        )}
      </div>
      <div className="pnl-calendar-footer">
        <span>盈利 <b className="is-up">{up}</b> {unit}</span>
        <span>亏损 <b className="is-down">{down}</b> {unit}</span>
        {filled.length ? <span>最好 <b className={toneClass(Math.max(...filled))}>{signedPercent(Math.max(...filled))}</b></span> : null}
        {filled.length ? <span>最差 <b className={toneClass(Math.min(...filled))}>{signedPercent(Math.min(...filled))}</b></span> : null}
      </div>
    </div>
  );
}
