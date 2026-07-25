import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobilePageFrame } from "../src/components/MobilePageFrame";
import { SecondaryNavigation } from "../src/components/SecondaryNavigation";

describe("secondary navigation", () => {
  it("uses one shared compact geometry for every root module", () => {
    const onChange = vi.fn();
    render(
      <SecondaryNavigation
        items={[
          { key: "all", label: "全部" },
          { key: "important", label: "重要" }
        ]}
        activeKey="all"
        onChange={onChange}
      />
    );

    const navigation = screen.getByRole("tablist");
    expect(navigation).toHaveClass("secondary-navigation");
    expect(navigation).toHaveAttribute("data-height", "36");
    fireEvent.click(screen.getByRole("tab", { name: "重要" }));
    expect(onChange).toHaveBeenCalledWith("important");
  });

  it("pins the optional end action after the scrollable tabs without selecting it", () => {
    const onChange = vi.fn();
    const onEditGroups = vi.fn();
    render(
      <SecondaryNavigation
        items={[
          { key: "all", label: "全部" },
          { key: "group", label: "投资记录" }
        ]}
        activeKey="all"
        onChange={onChange}
        endAction={{ label: "编辑分组", onClick: onEditGroups }}
      />
    );

    const action = screen.getByRole("button", { name: "编辑分组" });
    expect(action).toHaveClass("secondary-navigation__end-action");
    expect(action.parentElement).toBe(screen.getByRole("tablist"));
    fireEvent.click(action);

    expect(onEditGroups).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("interpolates one blue indicator between adjacent tabs during a pager drag", () => {
    const items = [
      { key: "all", label: "全部" },
      { key: "work", label: "工作" }
    ] as const;
    const { rerender } = render(
      <SecondaryNavigation
        items={items}
        activeKey="all"
        onChange={vi.fn()}
      />
    );

    const [allTab, workTab] = screen.getAllByRole("tab");
    Object.defineProperties(allTab, {
      offsetLeft: { configurable: true, value: 0 },
      offsetWidth: { configurable: true, value: 100 }
    });
    Object.defineProperties(workTab, {
      offsetLeft: { configurable: true, value: 100 },
      offsetWidth: { configurable: true, value: 140 }
    });

    rerender(
      <SecondaryNavigation
        items={items}
        activeKey="all"
        motion={{ fromIndex: 0, toIndex: 1, progress: 0.5 }}
        onChange={vi.fn()}
      />
    );

    const indicator = screen.getByTestId("secondary-navigation-indicator");
    expect(indicator).toHaveStyle({
      transform: "translate3d(81.2px, 0, 0)",
      width: "57.6px"
    });
  });
});
