import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HashRouter } from "react-router-dom";
import { MobileApp } from "../src/app/MobileApp";
import { tokenStorageKey } from "../src/api/client";

describe("mobile Markdown report", () => {
  beforeEach(() => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/reports/7";
  });

  it("renders a GitHub Flavored Markdown table", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/content")) {
        return new Response("| 名称 | 数值 |\n| --- | ---: |\n| 信息总量 | 485 |");
      }
      return new Response(JSON.stringify({ id: 7, title: "测试报告" }), {
        headers: { "Content-Type": "application/json" }
      });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <MobileApp />
        </QueryClientProvider>
      </HashRouter>
    );

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "485" })).toBeInTheDocument();
  });
});
