import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeBridge, publishNavigationState } from "../src/native/bridge";

describe("native bridge", () => {
  afterEach(() => {
    delete window.LiuliNative;
  });

  it("publishes the selected section and bottom navigation visibility", () => {
    const setNavigationState = vi.fn();
    window.LiuliNative = { setNavigationState };

    publishNavigationState("news", true, false);

    expect(setNavigationState).toHaveBeenCalledWith("news", true, false);
  });

  it("publishes whether Android should delegate the system back action to H5", () => {
    const setNavigationState = vi.fn();
    window.LiuliNative = { setNavigationState };

    publishNavigationState("tasks", true, true);

    expect(setNavigationState).toHaveBeenCalledWith("tasks", true, true);
  });

  it("remains safe in a normal mobile browser without an Android bridge", () => {
    expect(() => publishNavigationState("dashboard", true, false)).not.toThrow();
    expect(nativeBridge.isAvailable()).toBe(false);
  });
});
