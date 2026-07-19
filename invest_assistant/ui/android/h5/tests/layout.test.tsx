import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    expect(navigation).toHaveAttribute("data-height", "44");
    fireEvent.click(screen.getByRole("tab", { name: "重要" }));
    expect(onChange).toHaveBeenCalledWith("important");
  });
});
