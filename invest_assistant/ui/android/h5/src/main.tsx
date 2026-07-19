import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MobileApp } from "./app/MobileApp";
import "./styles.css";

const storedTheme = window.localStorage.getItem("liuli.mobile.theme") ?? "system";
const dark = storedTheme === "dark" || (storedTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.dataset.theme = dark ? "dark" : "light";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <MobileApp />
      </QueryClientProvider>
    </HashRouter>
  </React.StrictMode>
);
