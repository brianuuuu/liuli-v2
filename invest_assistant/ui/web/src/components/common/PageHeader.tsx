import { Space, Typography } from "antd";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-title-block">
        <Typography.Title level={3}>{title}</Typography.Title>
        {description ? <span className="page-context">{description.replaceAll("/", "·")}</span> : null}
      </div>
      {actions ? <Space>{actions}</Space> : null}
    </div>
  );
}
