import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMobileQueryClient } from "../src/queryClient";

describe("mobile query client", () => {
  it("reuses fresh cached data without refetching when a pager page remounts", async () => {
    const queryFn = vi.fn().mockResolvedValue("cached-page");
    const client = createMobileQueryClient();

    function QueryPage() {
      const query = useQuery({
        queryKey: ["pager-remount"],
        queryFn
      });
      return <div>{query.data}</div>;
    }

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <QueryPage />
      </QueryClientProvider>
    );
    expect(await screen.findByText("cached-page")).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledOnce();

    rerender(<QueryClientProvider client={client}><div>evicted</div></QueryClientProvider>);
    rerender(
      <QueryClientProvider client={client}>
        <QueryPage />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("cached-page")).toBeInTheDocument());
    expect(queryFn).toHaveBeenCalledOnce();
  });
});
