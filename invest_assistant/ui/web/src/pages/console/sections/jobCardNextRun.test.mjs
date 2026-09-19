import fs from "node:fs";

const source = fs.readFileSync(new URL("./JobCard.tsx", import.meta.url), "utf8");

if (!source.includes("下次")) {
  throw new Error("JobCard should show the next scheduled run label");
}

if (!source.includes("formatTime(job.next_run_at)")) {
  throw new Error("JobCard should format and display job.next_run_at");
}
