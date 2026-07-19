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
});
