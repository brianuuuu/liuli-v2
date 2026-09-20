import { describe, expect, it } from "vitest";
import {
  ARCHIVED_TRACK_STATUS,
  buildDetailCycleRows,
  buildTrackRow,
  filterTracksByStatus,
  parseTrackSegments,
  sortTracksByPriority,
  trackLabel,
  trackStatusCounts,
  TRACK_STRENGTH_LABELS,
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
    headline_strength: "strong",
    ...overrides
  } as TrackTrendSnapshot;
}

function row(overrides: Partial<TrackRowView> = {}): TrackRowView {
  return {
    id: 1,
    name: "赛道",
    status: "active",
    headlineStrength: null,
    headlineCycle: null,
    researchPriority: null,
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
    expect(view.headlineStrength).toBeNull();
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

describe("sortTracksByPriority", () => {
  it("优先研究排最前，未研究的排最后", () => {
    const sorted = sortTracksByPriority([
      row({ id: 1, researchPriority: null }),
      row({ id: 2, researchPriority: "deprioritized" }),
      row({ id: 3, researchPriority: "priority" }),
      row({ id: 4, researchPriority: "tracking" })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([3, 4, 2, 1]);
  });

  it("同优先级内按强度排", () => {
    const sorted = sortTracksByPriority([
      row({ id: 1, researchPriority: "priority", headlineStrength: "weak" }),
      row({ id: 2, researchPriority: "priority", headlineStrength: "strong" }),
      row({ id: 3, researchPriority: "priority", headlineStrength: "medium" })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it("强度也相同时按热度，热度缺失排在有热度之后", () => {
    const sorted = sortTracksByPriority([
      row({ id: 1, researchPriority: "priority", headlineStrength: "strong", heat: null }),
      row({ id: 2, researchPriority: "priority", headlineStrength: "strong", heat: 40 })
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });

  it("全都相同时按名称兜底，同一批赛道无论来的顺序如何，结果都一样", () => {
    // 只断言确定性，不断言具体字母序：localeCompare 的排序依赖 Node 的 ICU 数据，
    // 写死顺序会让这条用例在不同环境下飘。稳定才是名称兜底的目的。
    const names = ["机器人", "AI算力", "固态电池"];
    const forward = sortTracksByPriority(names.map((name, index) => row({ id: index + 1, name })));
    const reversed = sortTracksByPriority([...names].reverse().map((name, index) => row({ id: index + 1, name })));
    expect(forward.map((item) => item.name)).toEqual(reversed.map((item) => item.name));
    expect(new Set(forward.map((item) => item.name))).toEqual(new Set(names));
  });

  it("不改动入参数组", () => {
    const input = [row({ id: 1, researchPriority: "tracking" }), row({ id: 2, researchPriority: "priority" })];
    sortTracksByPriority(input);
    expect(input.map((item) => item.id)).toEqual([1, 2]);
  });
});

describe("trackStatusCounts", () => {
  it("全部这一档不含归档", () => {
    const counts = trackStatusCounts([
      row({ id: 1, status: "active" }),
      row({ id: 2, status: "candidate" }),
      row({ id: 3, status: "paused" }),
      row({ id: 4, status: ARCHIVED_TRACK_STATUS })
    ]);
    expect(counts.all).toBe(3);
    expect(counts.archived).toBe(1);
    expect(counts.active).toBe(1);
  });
});

describe("buildDetailCycleRows", () => {
  it("恒定三行，主导周期被标出来", () => {
    const rows = buildDetailCycleRows(snapshot({ headline_cycle: "mid", mid_strength: "strong" }));
    expect(rows.map((item) => item.key)).toEqual(["short", "mid", "long"]);
    expect(rows.map((item) => item.isHeadline)).toEqual([false, true, false]);
  });

  it("没有快照也给三行骨架", () => {
    expect(buildDetailCycleRows(null)).toHaveLength(3);
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
    expect(trackLabel(TRACK_STRENGTH_LABELS, "strong")).toBe("强");
    expect(trackLabel(TRACK_STRENGTH_LABELS, "insufficient")).toBe("证据不足");
    expect(trackLabel(TRACK_STRENGTH_LABELS, "unknown-code")).toBe("unknown-code");
    expect(trackLabel(TRACK_STRENGTH_LABELS, null)).toBe("—");
  });
});
