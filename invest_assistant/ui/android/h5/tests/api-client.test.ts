import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, tokenStorageKey } from "../src/api/client";

describe("mobile API client", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("serializes only defined query parameters and attaches the token", async () => {
    window.localStorage.setItem(tokenStorageKey, "mobile-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient().get("/api/market-radar/source-items", {
      limit: 30,
      source_name: "东方财富",
      source_type: undefined
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("limit=30");
    expect(url).toContain(`source_name=${encodeURIComponent("东方财富")}`);
    expect(url).not.toContain("source_type");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer mobile-token");
  });

  it("clears an expired token and reports a typed 401", async () => {
    window.localStorage.setItem(tokenStorageKey, "expired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));

    const request = createApiClient().get("/api/auth/me");

    await expect(request).rejects.toEqual(expect.objectContaining({ status: 401 }));
    expect(window.localStorage.getItem(tokenStorageKey)).toBeNull();
  });

  it("forwards the query cancellation signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient().get("/api/market-radar/source-items", {}, controller.signal);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
