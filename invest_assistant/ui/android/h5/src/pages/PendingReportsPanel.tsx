import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { mobileApi } from "../api/mobileApi";
import { PullToRefresh } from "../components/PullToRefresh";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import type { PendingReport } from "../types/api";
import { formatDateTime } from "../utils/format";
import { splitPendingReportTitle } from "./pendingReportPresentation";

function failureText(error: unknown, fallback: string) {
  const detail = error instanceof ApiError ? error.detail : undefined;
  return detail ? `${fallback}：${detail}` : fallback;
}

export function PendingReportsPanel() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<PendingReport | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const query = useQuery({
    queryKey: ["pending-reports"],
    queryFn: ({ signal }) => mobileApi.pendingReports(signal)
  });
  const rows = query.data ?? [];

  const refresh = async () => {
    setFeedback("");
    const result = await query.refetch();
    if (result.isError) throw result.error;
  };

  const importReport = async (item: PendingReport) => {
    setBusyId(item.id);
    setFeedback("");
    try {
      await mobileApi.importPendingReport(item.id);
      setFeedback(`已导入《${item.title}》`);
      await client.invalidateQueries({ queryKey: ["pending-reports"] });
    } catch (error) {
      setFeedback(failureText(error, "导入失败"));
    } finally {
      setBusyId(null);
    }
  };

  const deleteReport = async (item: PendingReport) => {
    setBusyId(item.id);
    setFeedback("");
    try {
      await mobileApi.deletePendingReport(item.id);
      setFeedback(`已删除《${item.title}》`);
      await client.invalidateQueries({ queryKey: ["pending-reports"] });
    } catch (error) {
      setFeedback(failureText(error, "删除失败"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="tasks-panel pending-reports-panel">
      <PullToRefresh ariaLabel="待处理报告下拉刷新" onRefresh={refresh} disabled={busyId !== null}>
        {query.isLoading ? <LoadingState /> : query.isError ? (
          <ErrorState message="待处理报告加载失败" onRetry={() => void query.refetch()} />
        ) : rows.length ? (
          <div className="pending-report-list">
            {rows.map((item) => {
              const { reportType } = splitPendingReportTitle(item.title);
              return (
                <article className="pending-report-card" data-pending-report-id={item.id} key={item.id}>
                  <h2 className="pending-report-card__title">{item.title}</h2>
                  <div className="pending-report-card__meta">
                    {reportType ? <em>{reportType}</em> : null}
                    {item.researcher_code ? <span>{item.researcher_code}</span> : null}
                    <span>{formatDateTime(item.returned_at)}</span>
                  </div>
                  <div className="pending-report-card__actions" data-swipe-ignore="true">
                    <button
                      type="button"
                      className="is-read"
                      disabled={!item.report_id}
                      onClick={() => navigate(`/reports/${item.report_id}`)}
                    >
                      阅读
                    </button>
                    <button
                      type="button"
                      className="is-import"
                      disabled={busyId !== null}
                      onClick={() => void importReport(item)}
                    >
                      {busyId === item.id ? "处理中…" : "导入"}
                    </button>
                    <button
                      type="button"
                      className="is-delete"
                      disabled={busyId !== null}
                      onClick={() => setPendingDelete(item)}
                    >
                      删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="暂无待处理报告" detail="研究回流的新报告会显示在这里" />}
        {feedback ? <div className="batch-feedback" role="status">{feedback}</div> : null}
      </PullToRefresh>
      {/* 横滑分页容器带 transform，fixed 会退化成相对分页页面定位，确认弹层必须挂到 body 上。 */}
      {pendingDelete ? createPortal(
        <div className="sheet-backdrop" data-swipe-ignore="true">
          <section className="composer-sheet note-action-confirm" role="dialog" aria-modal="true" aria-labelledby="pending-report-delete-title">
            <header><strong id="pending-report-delete-title">确认删除待处理报告</strong></header>
            <p>删除后，这条回流记录将不再出现在待处理报告里，报告本身仍保留在报告库。</p>
            <div className="note-action-confirm-buttons">
              <button type="button" onClick={() => setPendingDelete(null)}>取消</button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  void deleteReport(target);
                }}
              >
                确认删除
              </button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
