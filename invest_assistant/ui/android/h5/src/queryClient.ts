import { QueryClient } from "@tanstack/react-query";

export function createMobileQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnMount: false
      }
    }
  });
}
