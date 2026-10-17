function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** "刚刚 / 12 分钟前 / 3 小时前 / 2 天前"，用于积压时长与新鲜度。 */
export function relativeTime(value?: string | null, now = Date.now()): string {
  const time = parseTime(value);
  if (time == null) return "-";
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function minutesSince(value?: string | null, now = Date.now()): number | null {
  const time = parseTime(value);
  return time == null ? null : Math.max(0, (now - time) / 60000);
}

/** 积压时长：只到"天/小时"粒度，列表里一眼能分出新旧即可。 */
export function backlogAge(value?: string | null, now = Date.now()): string {
  const minutes = minutesSince(value, now);
  if (minutes == null) return "";
  if (minutes < 60) return "1 小时内";
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / 1440)} 天`;
}

export function shortTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(5, 16);
}

export function clockTime(value?: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(11, 16);
}

export function formatDuration(ms?: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

export function formatTokens(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString("zh-CN");
}
