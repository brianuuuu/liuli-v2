import { readFileSync } from "node:fs";

const sharedPath = "invest_assistant/ui/web/src/pages/track-discovery/sections/shared.tsx";
const materialsPath = "invest_assistant/ui/web/src/pages/track-discovery/sections/MaterialsSection.tsx";
const cssPath = "invest_assistant/ui/web/src/styles/global.css";

const shared = readFileSync(sharedPath, "utf8");
const materials = readFileSync(materialsPath, "utf8");
const css = readFileSync(cssPath, "utf8");

if (!shared.includes("export function directionAccentColor")) {
  throw new Error("Track material direction colors should be centralized in directionAccentColor");
}

for (const [direction, color] of [
  ["support", "#16a34a"],
  ["weaken", "#dc2626"],
  ["neutral", "#2563eb"],
  ["noise", "#64748b"],
]) {
  if (!shared.includes(`direction === "${direction}"`) || !shared.includes(`"${color}"`)) {
    throw new Error(`directionAccentColor should map ${direction} to ${color}`);
  }
}

if (!materials.includes("directionAccentColor")) {
  throw new Error("MaterialsSection should use directionAccentColor for the event note border");
}

if (!materials.includes('"--track-material-note-border"')) {
  throw new Error("MaterialsSection should pass a CSS variable for the event note border");
}

const noteRule = css.match(/\.track-material-card-note \{[\s\S]*?\}/)?.[0] || "";
if (!noteRule.includes("var(--track-material-note-border, var(--ll-accent))")) {
  throw new Error("Track material note border should use the direction CSS variable with an accent fallback");
}
