import type { ReactNode } from "react";

/**
 * A GitHub-style data panel with a separate toolbar bar above the table.
 *
 * Toolbar and table are visually independent containers (each has its own
 * rounded border) with a small gap between them — matching GitHub's
 * Issues/PR list pattern.
 */
export function DataPanel({
  toolbar,
  children,
}: {
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="data-panel">
      {toolbar && (
        Array.isArray(toolbar) ? (
          toolbar.map((item, idx) => item && (
            <div key={idx} className="data-panel-toolbar">
              {item}
            </div>
          ))
        ) : (
          <div className="data-panel-toolbar">{toolbar}</div>
        )
      )}
      {children}
    </div>
  );
}
