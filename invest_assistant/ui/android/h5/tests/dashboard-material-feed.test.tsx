import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardMaterialFeed,
  type DashboardMaterialItem
} from "../src/components/DashboardMaterialFeed";

const items: DashboardMaterialItem[] = [
  {
    id: 1,
    entityName: "半导体",
    direction: "support",
    title: "先进制程取得进展",
    summary: "材料摘要",
    sourceName: "来源 A",
    materialTime: "2026-07-29T10:00:00+08:00"
  },
  { id: 2, entityName: "消费", direction: "weaken", title: "需求转弱" },
  { id: 3, entityName: "电力", direction: "neutral", title: "供需平衡" },
  { id: 4, entityName: "噪声项", direction: "noise", title: "低相关材料" }
];

class ObserverFake {
  static instances: ObserverFake[] = [];
  readonly callback: IntersectionObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    ObserverFake.instances.push(this);
  }

  intersect() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

describe("DashboardMaterialFeed", () => {
  afterEach(() => {
    ObserverFake.instances = [];
    vi.unstubAllGlobals();
  });

  it("renders material identity, direction, summary and metadata", () => {
    vi.stubGlobal("IntersectionObserver", ObserverFake);
    render(
      <DashboardMaterialFeed
        items={items}
        hasNextPage={false}
        isFetchingNextPage={false}
        isFetchNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getByText("半导体")).toBeInTheDocument();
    expect(screen.getByText("利好")).toHaveClass("material-direction--positive");
    expect(screen.getByText("利空")).toHaveClass("material-direction--negative");
    expect(screen.getByText("中性")).toHaveClass("material-direction--neutral");
    expect(screen.queryByText("噪声")).not.toBeInTheDocument();
    expect(screen.getByText("材料摘要")).toBeInTheDocument();
    expect(screen.getByText(/来源 A · 07\/29 10:00/)).toBeInTheDocument();
    expect(screen.getByText("没有更多材料")).toBeInTheDocument();
  });

  it("guards repeated intersections until the current page request settles", () => {
    vi.stubGlobal("IntersectionObserver", ObserverFake);
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <DashboardMaterialFeed
        items={items}
        hasNextPage
        isFetchingNextPage={false}
        isFetchNextPageError={false}
        onLoadMore={onLoadMore}
      />
    );

    act(() => {
      ObserverFake.instances.at(-1)?.intersect();
      ObserverFake.instances.at(-1)?.intersect();
    });
    expect(onLoadMore).toHaveBeenCalledOnce();

    rerender(
      <DashboardMaterialFeed
        items={items}
        hasNextPage
        isFetchingNextPage
        isFetchNextPageError={false}
        onLoadMore={onLoadMore}
      />
    );
    rerender(
      <DashboardMaterialFeed
        items={items}
        hasNextPage
        isFetchingNextPage={false}
        isFetchNextPageError={false}
        onLoadMore={onLoadMore}
      />
    );
    act(() => ObserverFake.instances.at(-1)?.intersect());
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("keeps loaded items and offers retry after a next-page failure", () => {
    vi.stubGlobal("IntersectionObserver", ObserverFake);
    const onLoadMore = vi.fn();
    render(
      <DashboardMaterialFeed
        items={items}
        hasNextPage
        isFetchingNextPage={false}
        isFetchNextPageError
        onLoadMore={onLoadMore}
      />
    );

    expect(screen.getByText("半导体")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("falls back to a load-more button when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onLoadMore = vi.fn();
    render(
      <DashboardMaterialFeed
        items={items}
        hasNextPage
        isFetchingNextPage={false}
        isFetchNextPageError={false}
        onLoadMore={onLoadMore}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("renders the empty state", () => {
    vi.stubGlobal("IntersectionObserver", ObserverFake);
    render(
      <DashboardMaterialFeed
        items={[]}
        hasNextPage={false}
        isFetchingNextPage={false}
        isFetchNextPageError={false}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByText("暂无最新材料")).toBeInTheDocument();
  });
});
