import { Table } from "antd";
import { useCallback } from "react";
import { listStockReports } from "../../../api/stockAnalysis";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";

export function ReportsSection() {
  const reports = useAsyncData(useCallback(listStockReports, []), []);
  return (
    <DataPanel>
      <Table
        rowKey={(record, index) => String(record.id ?? index)}
        size="small"
        loading={reports.loading}
        dataSource={reports.data}
        columns={[
          { title: "标题", dataIndex: "title" },
          { title: "类型", dataIndex: "report_type" },
          { title: "状态", dataIndex: "status" },
          { title: "创建", dataIndex: "created_at" }
        ]}
        locale={{ emptyText: <EmptyAction description="暂无标的分析报告" /> }}
      />
    </DataPanel>
  );
}
