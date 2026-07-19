import { ChevronRight, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function SectionCard({ title, action, children, className = "" }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section-card ${className}`}>
      {title ? <header className="section-card__header"><h2>{title}</h2>{action}</header> : null}
      {children}
    </section>
  );
}

export function Metric({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "up" | "down" }) {
  return <div className={`metric metric--${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <div className="empty-state"><strong>{title}</strong>{detail ? <span>{detail}</span> : null}</div>;
}

export function ErrorState({ message = "加载失败", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="empty-state empty-state--error">
      <strong>{message}</strong>
      {onRetry ? <button type="button" className="text-button" onClick={onRetry}><RefreshCw size={15} />重试</button> : null}
    </div>
  );
}

export function LoadingState() {
  return <div className="skeleton-list" aria-label="加载中"><i /><i /><i /></div>;
}

export function ListRow({ title, meta, trailing, onClick }: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const content = <><div className="list-row__body"><strong>{title}</strong>{meta ? <span>{meta}</span> : null}</div>{trailing ?? (onClick ? <ChevronRight size={17} /> : null)}</>;
  return onClick
    ? <button type="button" className="list-row" onClick={onClick}>{content}</button>
    : <div className="list-row">{content}</div>;
}
