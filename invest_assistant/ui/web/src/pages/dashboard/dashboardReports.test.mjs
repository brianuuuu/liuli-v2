import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const helperPath = path.resolve("src/pages/dashboard/dashboardReports.ts");
const source = fs.readFileSync(helperPath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require });

const {
  DEFAULT_REPORT_PAGE_SIZE,
  reportMatchesKind,
  reportPageParams
} = module.exports;

if (DEFAULT_REPORT_PAGE_SIZE !== 20) {
  throw new Error("Default latest reports page size should be 20");
}

if (JSON.stringify(reportPageParams(1, DEFAULT_REPORT_PAGE_SIZE)) !== JSON.stringify({ limit: 20, offset: 0 })) {
  throw new Error("First page params should request limit=20 and offset=0");
}

if (JSON.stringify(reportPageParams(2, DEFAULT_REPORT_PAGE_SIZE)) !== JSON.stringify({ limit: 20, offset: 20 })) {
  throw new Error("Second page params should request offset=20");
}

if (!reportMatchesKind({ source_module: "market_radar", report_type: "daily", target_type: "market_daily" }, "market")) {
  throw new Error("Market radar daily reports should match the market segment");
}

if (!reportMatchesKind({ source_module: "track_discovery", report_type: "analysis", target_type: "track" }, "track")) {
  throw new Error("Track reports should match the track segment");
}

if (!reportMatchesKind({ source_module: "stock_analysis", report_type: "analysis", target_type: "stock" }, "stock")) {
  throw new Error("Stock reports should match the stock segment");
}
