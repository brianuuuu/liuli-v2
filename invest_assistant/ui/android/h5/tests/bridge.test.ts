import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeBridge, publishNavigationState } from "../src/native/bridge";

describe("native bridge", () => {
  afterEach(() => {
    delete window.LiuliNative;
  });

  it("publishes the selected section and bottom navigation visibility", () => {
    const setNavigationState = vi.fn();
    window.LiuliNative = { setNavigationState };

    publishNavigationState("news", true);

    expect(setNavigationState).toHaveBeenCalledWith("news", true);
  });

  it("remains safe in a normal mobile browser without an Android bridge", () => {
    expect(() => publishNavigationState("dashboard", true)).not.toThrow();
    expect(nativeBridge.isAvailable()).toBe(false);
  });
});
