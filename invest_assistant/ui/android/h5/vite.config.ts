import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: "/mobile/",
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5174,
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://115.29.176.240:5173",
          changeOrigin: true
        }
      }
    },
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts"
    }
  };
});
