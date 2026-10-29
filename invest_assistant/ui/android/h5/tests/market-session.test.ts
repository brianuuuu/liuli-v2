import { describe, expect, it } from "vitest";
import { marketSession, shanghaiClock } from "../src/pages/marketSession";

// 2026-10-29 是星期四；时间都按北京时间（+08:00）写，和设备时区无关
const at = (time: string, date = "2026-10-29") => new Date(`${date}T${time}:00+08:00`);

describe("A 股交易状态", () => {
  it("按北京时间拆出日期、星期和分钟", () => {
    expect(shanghaiClock(new Date("2026-10-28T17:30:00Z"))).toEqual({ date: "2026-10-29", weekday: 4, minutes: 90 });
  });

  it("按交易时段给出状态，交易中带倒计时", () => {
    expect(marketSession(at("08:50"))).toEqual({ label: "未开盘", live: false });
    expect(marketSession(at("09:20"))).toEqual({ label: "集合竞价", live: true });
    expect(marketSession(at("10:05"))).toEqual({ label: "交易中 · 距午休 1:25", live: true });
    expect(marketSession(at("12:10"))).toEqual({ label: "午间休市", live: false });
    expect(marketSession(at("13:40"))).toEqual({ label: "交易中 · 距收盘 1:20", live: true });
    expect(marketSession(at("14:55"))).toEqual({ label: "交易中 · 距收盘 0:05", live: true });
    expect(marketSession(at("15:00"))).toEqual({ label: "已收盘", live: false });
  });

  it("周末休市", () => {
    expect(marketSession(at("10:00", "2026-10-31"))).toEqual({ label: "休市", live: false });
  });

  it("工作日开盘后指数没有今天的报价，判定为节假日休市", () => {
    const yesterday = ["2026-10-28T07:00:00Z", "2026-10-28T07:00:00Z"];
    expect(marketSession(at("10:00"), yesterday)).toEqual({ label: "休市", live: false });
    // 开盘头十分钟行情可能还没写库，不急着下结论
    expect(marketSession(at("09:35"), yesterday).live).toBe(true);
    // 有一条是今天的报价就照常交易；没有行情数据时无从判断，也照常
    expect(marketSession(at("10:00"), [...yesterday, "2026-10-29T02:00:00Z"]).live).toBe(true);
    expect(marketSession(at("10:00"), []).live).toBe(true);
  });
});
