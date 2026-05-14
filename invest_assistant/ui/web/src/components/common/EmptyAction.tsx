import { Button, Empty } from "antd";
import type { ReactNode } from "react";

type EmptyActionProps = {
  description: string;
  actionText?: string;
  onAction?: () => void;
  extra?: ReactNode;
};

export function EmptyAction({ description, actionText, onAction, extra }: EmptyActionProps) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>
      {actionText && onAction ? (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      ) : (
        extra
      )}
    </Empty>
  );
}
