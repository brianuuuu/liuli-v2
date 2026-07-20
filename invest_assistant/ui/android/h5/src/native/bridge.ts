import type { SectionKey } from "../app/navigation";

export type ThemeMode = "light" | "dark" | "system";

export type LiuliNativeApi = {
  setNavigationState?: (section: SectionKey, showBottomBar: boolean, canHandleBack: boolean) => void;
  setTheme?: (mode: ThemeMode) => void;
  setServer?: (url: string) => void;
  openDownloadedFile?: (url: string, filename: string) => void;
  logout?: () => void;
};

declare global {
  interface Window {
    LiuliNative?: LiuliNativeApi;
  }
}

export const nativeBridge = {
  isAvailable() {
    return Boolean(window.LiuliNative);
  },
  setTheme(mode: ThemeMode) {
    window.LiuliNative?.setTheme?.(mode);
  },
  setServer(url: string) {
    window.LiuliNative?.setServer?.(url);
  },
  openDownloadedFile(url: string, filename: string) {
    window.LiuliNative?.openDownloadedFile?.(url, filename);
  },
  logout() {
    window.LiuliNative?.logout?.();
  }
};

export function publishNavigationState(section: SectionKey, showBottomBar: boolean, canHandleBack: boolean) {
  window.LiuliNative?.setNavigationState?.(section, showBottomBar, canHandleBack);
}

export function requestAppBack() {
  window.dispatchEvent(new CustomEvent("liuli:back"));
}
