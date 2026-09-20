import { describe, expect, it } from "vitest";
import {
  ARCHIVED_TRACK_STATUS,
  buildDetailScoreRows,
  buildTrackRow,
  filterTracksByStatus,
  parseTrackSegments,
  sortTracks,
  sortTracksByGrade,
  sortTracksByHeat,
  trackLabel,
  trackStatusCounts,
  TRACK_INDUSTRY_PHASE_LABELS,
  type TrackRowView
} from "../src/pages/trackLibraryGroups";
import type { TrackListItem, TrackTrendSnapshot } from "../src/types/api";

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
    headlineCycle: null,
    coreJudgment: "尚无研究结论",
    industryPhase: null,
    marketPhase: null,
    heat: null,
    researched: false,
    ...overrides
  };
}

describe("buildTrackRow", () => {
  it("快照的核心判断优先于 track 上回填的当前判断", () => {
    const view = buildTrackRow(track({ current_view: "回填的旧判断" }), snapshot({ core_judgment: "快照的新判断" }), {});
    expect(view.coreJudgment).toBe("快照的新判断");
    expect(view.researched).toBe(true);
  });

  it("没有快照时退回 track 的当前判断", () => {
    const view = buildTrackRow(track({ current_view: "人工写的判断" }), undefined, {});
    expect(view.coreJudgment).toBe("人工写的判断");
    expect(view.researched).toBe(false);
    expect(view.grade).toBeNull();
  });

  it("列表项自带的评级也算研究过：赛道库列表不会带完整快照", () => {
    const view = buildTrackRow(track({ track_grade: "A", heat_tier: "T2", overall_score: 7.2 }), undefined, {});
    expect(view.grade).toBe("A");
    expect(view.heatTier).toBe("T2");
    expect(view.overallScore).toBe(7.2);
    expect(view.researched).toBe(true);
  });

  it("两边都有时以快照为准", () => {
    const view = buildTrackRow(track({ track_grade: "C", overall_score: 5.1 }), snapshot(), {});
    expect(view.grade).toBe("S");
    expect(view.overallScore).toBe(8.08);
  });

  it("两者都没有时给占位，不返回空串", () => {
    expect(buildTrackRow(track(), undefined, {}).coreJudgment).toBe("尚无研究结论");
  });

  it("阶段取快照优先、track 兜底", () => {
    const view = buildTrackRow(track({ market_phase: "latent" }), snapshot({ market_phase: "accelerate" }), {});
    expect(view.marketPhase).toBe("accelerate");
    const fallback = buildTrackRow(track({ market_phase: "latent" }), snapshot({ market_phase: null }), {});
    expect(fallback.marketPhase).toBe("latent");
  });

  it("热度按 track_id 查表，缺失是 null 不是 0", () => {
    expect(buildTrackRow(track({ id: 7 }), undefined, { 7: 89 }).heat).toBe(89);
    expect(buildTrackRow(track({ id: 7 }), undefined, {}).heat).toBeNull();
  });
});

describe("filterTracksByStatus", () => {
  const rows = [
    row({ id: 1, status: "active" }),
    row({ id: 2, status: "candidate" }),
    row({ id: 3, status: ARCHIVED_TRACK_STATUS })
  ];

  it("默认的全部视图不含归档：归档等同软删除", () => {
    expect(filterTracksByStatus(rows, "all").map((item) => item.id)).toEqual([1, 2]);
  });

  it("只有显式切到归档才看得到", () => {
    expect(filterTracksByStatus(rows, ARCHIVED_TRACK_STATUS).map((item) => item.id)).toEqual([3]);
  });

  it("其余分组按状态精确匹配", () => {
    expect(filterTracksByStatus(rows, "candidate").map((item) => item.id)).toEqual([2]);
  });
});

describe("sortTracksByGrade", () => {
  it("评级高的排最前，未研究的排最后", () => {
    const sorted = sortTracksByGrade([
      row({ id: 1, grade: null }),
      row({ id: 2, grade: "C" }),
      row({ id: 3, grade: "S" }),
      row({ id: 4, grade: "A" })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([3, 4, 2, 1]);
  });

  it("同评级内按综合分排", () => {
    const sorted = sortTracksByGrade([
      row({ id: 1, grade: "A", overallScore: 7.1 }),
      row({ id: 2, grade: "A", overallScore: 7.9 }),
      row({ id: 3, grade: "A", overallScore: 7.4 })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("综合分也相同时按热度，热度缺失排在有热度之后", () => {
    const sorted = sortTracksByGrade([
      row({ id: 1, grade: "S", overallScore: 8.2, heat: null }),
      row({ id: 2, grade: "S", overallScore: 8.2, heat: 40 })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });

  it("全都相同时按名称兜底，同一批赛道无论来的顺序如何，结果都一样", () => {
    // 只断言确定性，不断言具体字母序：localeCompare 的排序依赖 Node 的 ICU 数据，
    // 写死顺序会让这条用例在不同环境下飘。稳定才是名称兜底的目的。
    const names = ["机器人", "AI算力", "固态电池"];
    const forward = sortTracksByGrade(names.map((name, index) => row({ id: index + 1, name })));
    const reversed = sortTracksByGrade([...names].reverse().map((name, index) => row({ id: index + 1, name })));
    expect(forward.map((item) => item.name)).toEqual(reversed.map((item) => item.name));
    expect(new Set(forward.map((item) => item.name))).toEqual(new Set(names));
  });

  it("不改动入参数组", () => {
    const input = [row({ id: 1, grade: "B" }), row({ id: 2, grade: "S" })];
    sortTracksByGrade(input);
    expect(input.map((item) => item.id)).toEqual([1, 2]);
  });
});

describe("sortTracksByHeat", () => {
  it("热度高的排最前", () => {
    const sorted = sortTracksByHeat([
      row({ id: 1, heat: 12 }),
      row({ id: 2, heat: 89 }),
      row({ id: 3, heat: 45 })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("热度缺失排在有热度的之后，包括热度为 0 的", () => {
    // 看板热度是单独一条查询，失败或未统计时是缺值，不能当成"没人关注"
    const sorted = sortTracksByHeat([row({ id: 1, heat: null }), row({ id: 2, heat: 0 })]);
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });

  it("热度相同时按综合分，再按名称兜底", () => {
    const sorted = sortTracksByHeat([
      row({ id: 1, heat: 30, overallScore: 6.1 }),
      row({ id: 2, heat: 30, overallScore: 8.3 })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });

  it("按热度排时不看评级：C 级的热赛道要能排到 S 级前面", () => {
    const sorted = sortTracksByHeat([
      row({ id: 1, grade: "S", overallScore: 8.4, heat: 3 }),
      row({ id: 2, grade: "C", overallScore: 5.2, heat: 91 })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });

  it("不改动入参数组", () => {
    const input = [row({ id: 1, heat: 1 }), row({ id: 2, heat: 99 })];
    sortTracksByHeat(input);
    expect(input.map((item) => item.id)).toEqual([1, 2]);
  });
});

describe("sortTracks", () => {
  it("按键分派到两种排法，默认走综合评分", () => {
    const rows = [
      row({ id: 1, grade: "S", overallScore: 8.4, heat: 3 }),
      row({ id: 2, grade: "C", overallScore: 5.2, heat: 91 })
    ];
    expect(sortTracks(rows, "grade").map((item) => item.id)).toEqual([1, 2]);
    expect(sortTracks(rows, "heat").map((item) => item.id)).toEqual([2, 1]);
    expect(sortTracks(rows, "grade")).toEqual(sortTracksByGrade(rows));
  });
});

describe("trackStatusCounts", () => {
  it("全部这一档不含归档", () => {
    const counts = trackStatusCounts([
      row({ id: 1, status: "active" }),
      row({ id: 2, status: "candidate" }),
      row({ id: 3, status: "candidate" }),
      row({ id: 4, status: ARCHIVED_TRACK_STATUS })
    ]);
    expect(counts.all).toBe(3);
    expect(counts.archived).toBe(1);
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
