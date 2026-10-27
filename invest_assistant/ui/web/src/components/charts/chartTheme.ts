import { themeColors } from "../../app/themeColors";

export function chartTextColor(mode: "light" | "dark") {
  return themeColors(mode).text2;
}

export function chartGridColor(mode: "light" | "dark") {
  return mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.10)";
}

export function chartBackgroundColor(mode: "light" | "dark") {
  return "transparent";
}
