import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { FONT_FAMILY, themeColors } from "./themeColors";

export type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = "liuli.theme.mode";

function getSystemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function LiuliThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
  });
  const [systemMode, setSystemMode] = useState<"light" | "dark">(getSystemMode);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemMode(getSystemMode());
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const resolvedMode = mode === "system" ? systemMode : mode;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedMode);
  }, [resolvedMode]);

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode(nextMode: ThemeMode) {
        window.localStorage.setItem(storageKey, nextMode);
        setModeState(nextMode);
      }
    }),
    [mode, resolvedMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: resolvedMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            borderRadius: 6,
            colorPrimary: themeColors(resolvedMode).accent,
            fontFamily: FONT_FAMILY
          },
          components: {
            // 实心主按钮用沉一档的蓝，白字对比度够；去掉 antd 默认的底部投影
            Button: {
              colorPrimary: themeColors(resolvedMode).fill,
              colorPrimaryHover: themeColors(resolvedMode).fillHover,
              colorPrimaryActive: themeColors(resolvedMode).fillActive,
              primaryShadow: "none"
            }
          }
        }}
      >
        <div data-theme={resolvedMode}>{children}</div>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useLiuliTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useLiuliTheme must be used inside LiuliThemeProvider");
  }
  return value;
}
