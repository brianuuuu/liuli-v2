import { Card } from "antd";
import type { CSSProperties, ReactNode } from "react";

export function WorkbenchCard({
  title,
  children,
  extra,
  style,
  className
}: {
  title?: string;
  children: ReactNode;
  extra?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <Card
      title={title}
      extra={extra}
      className={["workbench-card", className].filter(Boolean).join(" ")}
      styles={{ body: { padding: 16 } }}
      style={style}
    >
      {children}
    </Card>
  );
}
