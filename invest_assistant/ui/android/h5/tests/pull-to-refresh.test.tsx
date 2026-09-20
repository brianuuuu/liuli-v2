import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PullToRefresh } from "../src/components/PullToRefresh";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function touch(
  target: Element,
  type: "touchStart" | "touchMove" | "touchEnd",
  x: number,
  y: number
) {
  const point = { identifier: 1, clientX: x, clientY: y, target };
  fireEvent[type](target, {
    touches: type === "touchEnd" ? [] : [point],
    changedTouches: [point]
  });
}

describe("PullToRefresh", () => {
  afterEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    vi.useRealTimers();
  });

  it("refreshes once after a top-of-page vertical pull passes 64px", async () => {
    const refresh = deferred<void>();
    const onRefresh = vi.fn(() => refresh.promise);
    render(<PullToRefresh onRefresh={onRefresh}><div>内容</div></PullToRefresh>);
    const region = screen.getByLabelText("下拉刷新");

    touch(region, "touchStart", 120, 100);
    touch(region, "touchMove", 122, 190);
    expect(screen.getByText("释放刷新")).toBeInTheDocument();
    touch(region, "touchEnd", 122, 190);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByText("正在刷新")).toBeInTheDocument();

    touch(region, "touchStart", 120, 100);
    touch(region, "touchMove", 120, 200);
    touch(region, "touchEnd", 120, 200);
    expect(onRefresh).toHaveBeenCalledOnce();

    refresh.resolve();
    await waitFor(() => expect(screen.queryByText("正在刷新")).not.toBeInTheDocument());
  });

  it("does not refresh before the pull passes the trigger distance", () => {
    const onRefresh = vi.fn(async () => undefined);
    render(<PullToRefresh onRefresh={onRefresh}><div>内容</div></PullToRefresh>);
    const region = screen.getByLabelText("下拉刷新");

    touch(region, "touchStart", 100, 100);
    touch(region, "touchMove", 100, 150);
    touch(region, "touchEnd", 100, 150);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("leaves horizontal gestures for the surrounding pager", () => {
    const onRefresh = vi.fn(async () => undefined);
    render(<PullToRefresh onRefresh={onRefresh}><div>内容</div></PullToRefresh>);
    const region = screen.getByLabelText("下拉刷新");

    touch(region, "touchStart", 180, 100);
    touch(region, "touchMove", 80, 120);
    touch(region, "touchEnd", 80, 120);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(region).toHaveStyle({ "--pull-distance": "0px" });
  });

  it("does not refresh when the current page is scrolled", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    const onRefresh = vi.fn(async () => undefined);
    render(<PullToRefresh onRefresh={onRefresh}><div>内容</div></PullToRefresh>);
    const region = screen.getByLabelText("下拉刷新");

    touch(region, "touchStart", 100, 100);
    touch(region, "touchMove", 100, 210);
    touch(region, "touchEnd", 100, 210);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not start from an editor or explicitly ignored content", () => {
    const onRefresh = vi.fn(async () => undefined);
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <textarea aria-label="备注" />
        <div data-swipe-ignore="true">图表</div>
      </PullToRefresh>
    );

    for (const target of [screen.getByRole("textbox", { name: "备注" }), screen.getByText("图表")]) {
      touch(target, "touchStart", 100, 100);
      touch(target, "touchMove", 100, 210);
      touch(target, "touchEnd", 100, 210);
    }

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("pulls from a tappable row and suppresses its accidental click", async () => {
    const refresh = deferred<void>();
    const onRefresh = vi.fn(() => refresh.promise);
    const onRowClick = vi.fn();
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <button type="button" onClick={onRowClick}>列表行</button>
      </PullToRefresh>
    );
    const row = screen.getByRole("button", { name: "列表行" });

    touch(row, "touchStart", 100, 100);
    touch(row, "touchMove", 100, 210);
    touch(row, "touchEnd", 100, 210);
    fireEvent.click(row);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    refresh.resolve();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(""));
  });

  it("keeps a plain tap on a tappable row working", () => {
    const onRefresh = vi.fn(async () => undefined);
    const onRowClick = vi.fn();
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <button type="button" onClick={onRowClick}>列表行</button>
      </PullToRefresh>
    );
    const row = screen.getByRole("button", { name: "列表行" });

    // 位移不到 8px 的轴锁阈值：这是点，不是拉
    touch(row, "touchStart", 100, 100);
    touch(row, "touchMove", 100, 103);
    touch(row, "touchEnd", 100, 103);
    fireEvent.click(row);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("keeps content visible and reports a failed refresh briefly", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn(async () => {
      throw new Error("network");
    });
    render(<PullToRefresh onRefresh={onRefresh}><div>保留内容</div></PullToRefresh>);
    const region = screen.getByLabelText("下拉刷新");

    touch(region, "touchStart", 100, 100);
    touch(region, "touchMove", 100, 210);
    touch(region, "touchEnd", 100, 210);
    await act(async () => Promise.resolve());

    expect(screen.getByText("保留内容")).toBeInTheDocument();
    expect(screen.getByText("刷新失败，请重试")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1200));
    expect(screen.queryByText("刷新失败，请重试")).not.toBeInTheDocument();
  });
});
