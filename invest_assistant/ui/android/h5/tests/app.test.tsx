import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HashRouter } from "react-router-dom";
import { MobileApp } from "../src/app/MobileApp";
import { tokenStorageKey } from "../src/api/client";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <MobileApp />
      </QueryClientProvider>
    </HashRouter>
  );
}

describe("mobile H5 app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
  });

  afterEach(() => {
    delete window.LiuliNative;
    vi.unstubAllGlobals();
  });

  it("renders the H5 login and hides the native bottom bar before authentication", async () => {
    const setNavigationState = vi.fn();
    window.LiuliNative = { setNavigationState };

    renderApp();

    expect(await screen.findByRole("heading", { name: "琉璃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(setNavigationState).toHaveBeenCalledWith("dashboard", false);
  });

  it("renders the news root with the shared compact secondary navigation", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/news";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, limit: 30, offset: 0, has_more: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    expect(await screen.findByRole("tab", { name: "个股" })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toHaveAttribute("data-height", "44");
  });

  it("hides the native bottom bar only while reading a report", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/reports/7";
    const setNavigationState = vi.fn();
    window.LiuliNative = { setNavigationState };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 7, title: "测试报告", report_type: "research", source_module: "stock" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    await waitFor(() => expect(setNavigationState).toHaveBeenCalledWith("dashboard", false));
  });

  it("shows the authenticated username instead of a stale display name", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/me";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 1, username: "admin", display_name: "brian" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    expect(await screen.findByText("admin")).toBeInTheDocument();
    expect(screen.queryByText("brian")).not.toBeInTheDocument();
  });
});
