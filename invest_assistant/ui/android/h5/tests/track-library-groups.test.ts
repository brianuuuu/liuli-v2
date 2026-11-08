import { describe, expect, it } from "vitest";
import {
  ARCHIVED_TRACK_STATUS,
  buildDetailScoreRows,
  buildTrackRow,
  filterTracksByStatus,
  parseTrackSegments,
  sortTracks,
  nextTrackSort,
  trackSortLabel,
  trackLabel,
  trackStatusCounts,
  TRACK_INDUSTRY_PHASE_LABELS,
  type TrackRowView
} from "../src/pages/trackLibraryGroups";
import type { TrackCycleView, TrackListItem, TrackTrendSnapshot } from "../src/types/api";

function track(overrides: Partial<TrackListItem> = {}): TrackListItem {
  return { id: 1, name: "AI算力", status: "active", ...overrides };
}

function snapshot(overrides: Partial<TrackTrendSnapshot> = {}): TrackTrendSnapshot {
  return {
    id: 1,
    track_id: 1,
    research_date: "2026-07-05",
    headline_cycle: "long",
    market_heat_score: 8.5,
    growth_speed_score: 9,
    concentration_score: 8,
    cycle_resilience_score: 6.5,
    current_market_size_score: 7.5,
    future_market_size_score: 9,
    overall_score: 8.08,
    track_grade: "S",
    heat_tier: "T1",
    ...overrides
  } as TrackTrendSnapshot;
}

function row(overrides: Partial<TrackRowView> = {}): TrackRowView {
  return {
    id: 1,
    name: "赛道",
    status: "active",
    grade: null,
    heatTier: null,
    overallScore: null,
    cycleViews: {},
    coreJudgment: "尚无研究结论",
    industryPhase: null,
    marketPhase: null,
    researched: false,
    ...overrides
  };
}

function cycle(direction: TrackCycleView["direction"], snapshot_id = 1): TrackCycleView {
  return { direction, judgment: "周期判断", confidence: "medium", research_date: "2026-11-08", snapshot_id };
}

describe("buildTrackRow", () => {
  it("使用列表聚合的评分、阶段和各自来源不同的周期判断", () => {
    const view = buildTrackRow(track({
      track_grade: "A", heat_tier: "T2", overall_score: 7.2,
      current_view: "需求扩张", industry_phase: "expansion", market_phase: "recede",
      cycle_views: { short: cycle("negative", 3), long: cycle("positive", 1) }
    }));
    expect(view).toMatchObject({
      grade: "A", heatTier: "T2", overallScore: 7.2, researched: true,
      coreJudgment: "需求扩张", industryPhase: "expansion", marketPhase: "recede",
      cycleViews: { short: { direction: "negative", snapshot_id: 3 }, long: { direction: "positive", snapshot_id: 1 } }
    });
    expect(view.cycleViews.mid).toBeUndefined();
  });

  it("没有评分仍保留定性判断，缺失值不补成零分或中性", () => {
    const view = buildTrackRow(track({ current_view: "待商业化验证", cycle_views: { mid: cycle("uncertain") } }));
    expect(view.researched).toBe(false);
    expect(view.grade).toBeNull();
    expect(view.overallScore).toBeNull();
    expect(view.coreJudgment).toBe("待商业化验证");
    expect(view.cycleViews.mid?.direction).toBe("uncertain");
    expect(buildTrackRow(track()).cycleViews).toEqual({});
    expect(buildTrackRow(track()).coreJudgment).toBe("尚无研究结论");
  });
});

describe("filterTracksByStatus", () => {
  const rows = [
    row({ id: 1, status: "active" }),
    row({ id: 2, status: "candidate" }),
    row({ id: 3, status: ARCHIVED_TRACK_STATUS })
  ];

  it("全部视图不含归档：归档等同软删除", () => {
    expect(filterTracksByStatus(rows, "all").map((item) => item.id)).toEqual([1, 2]);
  });

  it("归档在任何分档下都不出现：移动端不做回收站", () => {
    // 接口默认就不返回归档，这里是第二道防线，口径变了也不会把回收站混进列表
    expect(filterTracksByStatus(rows, "active").map((item) => item.id)).toEqual([1]);
    expect(filterTracksByStatus([row({ id: 3, status: ARCHIVED_TRACK_STATUS })], "all")).toEqual([]);
  });

  it("其余分组按状态精确匹配", () => {
    expect(filterTracksByStatus(rows, "candidate").map((item) => item.id)).toEqual([2]);
  });
});

describe("sortTracks", () => {
  it("评分按综合分降序，缺分排最后且保留零分", () => {
    const rows = [row({ id: 1 }), row({ id: 2, overallScore: 0 }), row({ id: 3, overallScore: 8.3 }), row({ id: 4, overallScore: 7.5 })];
    expect(sortTracks(rows, "score").map((item) => item.id)).toEqual([3, 4, 2, 1]);
    expect(rows.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });

  it("资金热度按 T0 到 T4 排，同档按综合分，缺档最后", () => {
    const rows = [
      row({ id: 1, heatTier: "T4", overallScore: 9 }),
      row({ id: 2, heatTier: "T1", overallScore: 6 }),
      row({ id: 3, heatTier: "T0", overallScore: 5 }),
      row({ id: 4, heatTier: "T1", overallScore: 7 }),
      row({ id: 5, heatTier: null, overallScore: 10 }),
      row({ id: 6, heatTier: "T3" }),
      row({ id: 7, heatTier: "T2" })
    ];
    expect(sortTracks(rows, "heat").map((item) => item.id)).toEqual([3, 4, 2, 7, 6, 1, 5]);
    expect(rows[0].id).toBe(1);
  });

  it.each(["short", "mid", "long"] as const)("%s 按方向强弱排，同方向按综合分，待验证和缺失沉底", (key) => {
    const rows = [
      row({ id: 1, overallScore: 10 }),
      row({ id: 2, overallScore: 9, cycleViews: { [key]: cycle("uncertain") } }),
      row({ id: 3, overallScore: 8, cycleViews: { [key]: cycle("negative") } }),
      row({ id: 4, overallScore: 7, cycleViews: { [key]: cycle("neutral") } }),
      row({ id: 5, overallScore: 6, cycleViews: { [key]: cycle("positive") } }),
      row({ id: 6, overallScore: 7, cycleViews: { [key]: cycle("positive") } }),
      row({ id: 7, cycleViews: { [key]: cycle("positive") } })
    ];
    expect(sortTracks(rows, key).map((item) => item.id)).toEqual([6, 5, 7, 4, 3, 2, 1]);
    expect(rows[0].id).toBe(1);
  });

  it.each(["score", "heat", "short", "mid", "long"] as const)("%s 同分按名称稳定排序", (key) => {
    const rows = ["机器人", "AI算力", "固态电池"].map((name) => row({ name }));
    expect(sortTracks(rows, key).map((item) => item.name)).toEqual(sortTracks([...rows].reverse(), key).map((item) => item.name));
  });
});

describe("nextTrackSort", () => {
  it("单按钮按评分、热度、短期、中期、长期循环", () => {
    const keys = ["score", "heat", "short", "mid", "long"] as const;
    expect(keys.map(nextTrackSort)).toEqual(["heat", "short", "mid", "long", "score"]);
    expect(keys.map(trackSortLabel)).toEqual(["评分", "热度", "短期", "中期", "长期"]);
  });
});

describe("trackStatusCounts", () => {
  it("归档不计入任何一档", () => {
    const counts = trackStatusCounts([
      row({ id: 1, status: "active" }),
      row({ id: 2, status: "candidate" }),
      row({ id: 3, status: "candidate" }),
      row({ id: 4, status: ARCHIVED_TRACK_STATUS })
    ]);
    expect(counts.all).toBe(3);
    expect(counts.active).toBe(1);
    expect(counts.candidate).toBe(2);
  });

  it("已下线的状态码计入全部，但不单独开一档", () => {
    // 库里可能还留着 paused 这类历史取值，漏进"全部"总数才不会让人对不上账
    const counts = trackStatusCounts([row({ id: 1, status: "active" }), row({ id: 2, status: "paused" })]);
    expect(counts.all).toBe(2);
    expect(counts.active).toBe(1);
    expect(counts.candidate).toBe(0);
  });
});

describe("buildDetailScoreRows", () => {
  it("恒定六行，顺序固定", () => {
    const rows = buildDetailScoreRows(snapshot({ market_heat_score: 6 }));
    expect(rows.map((item) => item.key)).toEqual([
      "market_heat_score",
      "growth_speed_score",
      "concentration_score",
      "cycle_resilience_score",
      "current_market_size_score",
      "future_market_size_score"
    ]);
    expect(rows[0].value).toBe(6);
  });

  it("没有快照也给六行骨架，值是 null 不是 0", () => {
    const rows = buildDetailScoreRows(null);
    expect(rows).toHaveLength(6);
    expect(rows.every((item) => item.value === null)).toBe(true);
  });

  it("0 分是真实分数，不被当成缺值", () => {
    expect(buildDetailScoreRows(snapshot({ market_heat_score: 0 }))[0].value).toBe(0);
  });
});

describe("parseTrackSegments", () => {
  it("坏 JSON 降级成空数组，不抛", () => {
    expect(parseTrackSegments("{不是 JSON")).toEqual([]);
    expect(parseTrackSegments(null)).toEqual([]);
    expect(parseTrackSegments('{"segment":"x"}')).toEqual([]);
  });

  it("丢掉缺 segment 的脏数据", () => {
    const raw = JSON.stringify([{ segment: "先进封装", stance: "benefiting" }, { stance: "pressured" }]);
    expect(parseTrackSegments(raw).map((item) => item.segment)).toEqual(["先进封装"]);
  });
});

describe("trackLabel", () => {
  it("认识的码翻成中文，不认识的原样返回", () => {
    expect(trackLabel(TRACK_INDUSTRY_PHASE_LABELS, "expansion")).toBe("扩张");
    expect(trackLabel(TRACK_INDUSTRY_PHASE_LABELS, "contraction")).toBe("收缩");
    expect(trackLabel(TRACK_INDUSTRY_PHASE_LABELS, "unknown-code")).toBe("unknown-code");
    expect(trackLabel(TRACK_INDUSTRY_PHASE_LABELS, null)).toBe("—");
  });
});
