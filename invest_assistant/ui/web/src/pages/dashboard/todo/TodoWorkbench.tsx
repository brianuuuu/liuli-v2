import { message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { getWorkbenchOperations, type TodoKind, type WorkbenchOperations } from "../../../api/console";
import { apiErrorDetail } from "../../../api/client";
import { runJob } from "../../../api/jobs";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { OpsRail } from "./OpsRail";
import { AlertsTodo, NotesTodo, ReportsTodo, SuggestionsTodo } from "./TodoKinds";
import { backlogAge, formatTokens, minutesSince, relativeTime } from "./todoFormat";

const ACTIVE_POLL_MS = 4000;
const IDLE_POLL_MS = 60000;
const STALE_SOURCE_MINUTES = 30;

// 与安卓待办页同名同序：外部输入等我处理
const todoKinds: { key: TodoKind; label: string }[] = [
  { key: "suggestions", label: "推荐词" },
  { key: "reports", label: "报告" },
  { key: "notes", label: "笔记" },
  { key: "alerts", label: "预警" }
];

const emptySummary = { count: 0, oldest_at: null };

const initialOperations: WorkbenchOperations = {
  todo: { suggestions: emptySummary, reports: emptySummary, notes: emptySummary, alerts: emptySummary, total: 0 },
  ai_jobs: [],
  failed_jobs: [],
  recent_runs: [],
  health: { total_jobs: 0, failed_jobs: 0, running_jobs: 0, latest_source_at: null, ai_today: 0, ai_today_tokens: 0 }
};

export function TodoWorkbench() {
  const ops = useAsyncData(useCallback(getWorkbenchOperations, []), initialOperations);
  const [kind, setKind] = useState<TodoKind | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const data = ops.data;
  const hasActive = data.health.running_jobs > 0;
  const firstLoaded = data !== initialOperations;

  // 默认落到第一个有积压的页签；都清空时落到推荐词
  const activeKind: TodoKind = kind ?? todoKinds.find((item) => data.todo[item.key].count > 0)?.key ?? "suggestions";

  const { refresh } = ops;
  useEffect(() => {
    if (!firstLoaded) return;
    const timer = window.setInterval(() => void refresh(), hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [firstLoaded, hasActive, refresh]);

  const onChanged = useCallback(() => void refresh(), [refresh]);

  async function runOperation(jobName: string) {
    setRunningKey(jobName);
    try {
      await runJob(jobName, {});
      message.success("已提交执行");
      await refresh();
    } catch (error) {
      message.error(apiErrorDetail(error, "提交执行失败"));
    } finally {
      setRunningKey(null);
    }
  }

  return (
    <div className="todo-workbench">
      <HealthStrip data={data} />
      <div className="todo-layout">
        <section className="todo-inbox">
          <nav className="todo-tabs" role="tablist">
            {todoKinds.map((item) => {
              const summary = data.todo[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={item.key === activeKind}
                  className={item.key === activeKind ? "todo-tab active" : "todo-tab"}
                  onClick={() => setKind(item.key)}
                >
                  <span>{item.label}</span>
                  <span className={summary.count ? "todo-tab-count" : "todo-tab-count zero"}>{summary.count}</span>
                </button>
              );
            })}
            <span className="todo-tabs-hint">
              {data.todo[activeKind].count ? `最早一条已等待 ${backlogAge(data.todo[activeKind].oldest_at)}` : ""}
            </span>
          </nav>
          <div className="todo-inbox-body">
            {activeKind === "suggestions" ? (
              <SuggestionsTodo onChanged={onChanged} />
            ) : activeKind === "reports" ? (
              <ReportsTodo onChanged={onChanged} />
            ) : activeKind === "notes" ? (
              <NotesTodo onChanged={onChanged} />
            ) : (
              <AlertsTodo onChanged={onChanged} />
            )}
          </div>
        </section>
        <OpsRail data={data} runningKey={runningKey} onRun={runOperation} />
      </div>
    </div>
  );
}

function HealthStrip({ data }: { data: WorkbenchOperations }) {
  const oldest = todoKinds
    .map((item) => data.todo[item.key].oldest_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const sourceAge = minutesSince(data.health.latest_source_at);
  const sourceStale = sourceAge != null && sourceAge > STALE_SOURCE_MINUTES;
  const { failed_jobs: failed, running_jobs: running, total_jobs: totalJobs } = data.health;
  return (
    <div className="todo-health">
      <HealthCell label="待办" value={data.todo.total} note={data.todo.total ? `最早积压 ${backlogAge(oldest)}` : "已全部处理"} tone={data.todo.total ? "warning" : undefined} />
      <HealthCell
        label="任务"
        value={failed ? `${failed} 异常` : "正常"}
        note={`共 ${totalJobs} 个${running ? ` · ${running} 个执行中` : ""}`}
        tone={failed ? "danger" : "success"}
      />
      <HealthCell label="AI 今日" value={`${data.health.ai_today} 次`} note={`${formatTokens(data.health.ai_today_tokens)} tokens`} />
      <HealthCell
        label="最新资讯"
        value={relativeTime(data.health.latest_source_at)}
        note={sourceStale ? "超过 30 分钟未更新" : "信息流抓取正常"}
        tone={sourceStale ? "warning" : undefined}
      />
    </div>
  );
}

function HealthCell({ label, value, note, tone }: { label: string; value: string | number; note: string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="todo-health-cell">
      <span className="todo-health-label">
        {tone ? <i className={`todo-health-dot ${tone}`} /> : null}
        {label}
      </span>
      <strong>{value}</strong>
      <span className="todo-health-note">{note}</span>
    </div>
  );
}
