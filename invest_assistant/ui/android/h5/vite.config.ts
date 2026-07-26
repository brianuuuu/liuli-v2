import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiProxy = {
    "/api": {
      target: env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
      changeOrigin: true
    }
  };
  return {
    base: "/",
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: true,
      proxy: apiProxy
    },
    preview: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: true,
      proxy: apiProxy
    },
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
      exclude: [...configDefaults.exclude, "tests/runtime.test.mjs"]
    }
  };
});
