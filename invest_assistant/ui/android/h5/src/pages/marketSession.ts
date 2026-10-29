/**
 * 今日门面卡右上角的 A 股交易状态。按北京时间的交易时段在前端推算，不额外请求接口。
 *
 * 节假日前端自己判断不了，借今日大盘的报价时间兜底：工作日开盘一段时间后，
 * 指数里没有一条是今天的报价，就当作休市日。开盘前无从判断，节假日早上会先显示「未开盘」。
 */

export type MarketSession = { label: string; live: boolean };

type ShanghaiClock = { date: string; weekday: number; minutes: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function shanghaiClock(time: Date): ShanghaiClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(time).map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

const at = (hour: number, minute: number) => hour * 60 + minute;
const AUCTION_START = at(9, 15);
const MORNING_OPEN = at(9, 30);
const MORNING_CLOSE = at(11, 30);
const AFTERNOON_OPEN = at(13, 0);
const AFTERNOON_CLOSE = at(15, 0);
/** 开盘十分钟后还没有今天的指数报价，才认定是休市日，给行情任务留出写库的时间。 */
const HOLIDAY_CHECK_FROM = at(9, 40);

function countdown(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function marketSession(now: Date, quoteTimes: Array<string | null | undefined> = []): MarketSession {
  const clock = shanghaiClock(now);
  if (clock.weekday === 0 || clock.weekday === 6) return { label: "休市", live: false };
  const quoteDates = quoteTimes
    .filter((value): value is string => Boolean(value))
    .map((value) => shanghaiClock(new Date(value)).date);
  if (clock.minutes >= HOLIDAY_CHECK_FROM && quoteDates.length && !quoteDates.includes(clock.date)) {
    return { label: "休市", live: false };
  }
  const { minutes } = clock;
  if (minutes < AUCTION_START) return { label: "未开盘", live: false };
  if (minutes < MORNING_OPEN) return { label: "集合竞价", live: true };
  if (minutes < MORNING_CLOSE) return { label: `交易中 · 距午休 ${countdown(MORNING_CLOSE - minutes)}`, live: true };
  if (minutes < AFTERNOON_OPEN) return { label: "午间休市", live: false };
  if (minutes < AFTERNOON_CLOSE) return { label: `交易中 · 距收盘 ${countdown(AFTERNOON_CLOSE - minutes)}`, live: true };
  return { label: "已收盘", live: false };
}
