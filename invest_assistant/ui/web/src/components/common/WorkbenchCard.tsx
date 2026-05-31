import { Card } from "antd";
import type { ReactNode } from "react";

export function WorkbenchCard({ title, children, extra, style }: { title?: string; children: ReactNode; extra?: ReactNode; style?: React.CSSProperties }) {
  return (
    <Card title={title} extra={extra} className="workbench-card" styles={{ body: { padding: 16 } }} style={style}>
      {children}
    </Card>
  );
}
