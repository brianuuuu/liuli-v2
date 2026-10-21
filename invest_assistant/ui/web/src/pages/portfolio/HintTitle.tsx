import { InfoCircleOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import type { ReactNode } from "react";

/** 卡片标题 + ⓘ：口径说明不常看，收进悬浮提示，正文只留数据 */
export function HintTitle({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  if (!hint) return <>{title}</>;
  return (
    <span className="hint-title">
      {title}
      <Tooltip title={hint} placement="bottomLeft" styles={{ root: { maxWidth: 420 } }}>
        <InfoCircleOutlined className="hint-title-icon" aria-label="口径说明" />
      </Tooltip>
    </span>
  );
}
