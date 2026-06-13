import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/console/sections/JobCard.tsx"), "utf8");

if (!source.includes("下次")) {
  throw new Error("JobCard should show the next scheduled run label");
}

if (!source.includes("formatTime(job.next_run_at)")) {
  throw new Error("JobCard should format and display job.next_run_at");
}
