import { Card } from "antd";
import type { ReactNode } from "react";

export function WorkbenchCard({ title, children, extra }: { title?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <Card title={title} extra={extra} className="workbench-card" styles={{ body: { padding: 16 } }}>
      {children}
    </Card>
  );
}
