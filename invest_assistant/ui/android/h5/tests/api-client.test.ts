import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, tokenStorageKey } from "../src/api/client";
import { mobileApi } from "../src/api/mobileApi";

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

  it("loads market heat rankings across every tag type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await mobileApi.marketRankings();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/market-radar/rankings");
    expect(url).toContain("type=all");
    expect(url).not.toContain("type=tag");
  });

  it("loads cached major indices from the existing read-only workbench endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ market_indices: { items: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await mobileApi.workbenchToday();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/console\/workbench-today$/);
    expect(init.method).toBe("GET");
  });
});
