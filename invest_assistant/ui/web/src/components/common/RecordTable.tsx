import { Drawer, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useDrawerState } from "../../hooks/useDrawerState";
import { EmptyAction } from "./EmptyAction";

type RecordTableProps = {
  rowKey?: string;
  loading?: boolean;
  data: Record<string, unknown>[];
  columns: ColumnsType<Record<string, unknown>>;
  emptyText: string;
  drawerTitle?: string;
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function RecordTable({ rowKey = "id", loading, data, columns, emptyText, drawerTitle }: RecordTableProps) {
  const drawer = useDrawerState<Record<string, unknown>>();
  const keyOf = (record: Record<string, unknown>, index?: number) => String(record[rowKey] ?? index ?? Math.random());

  return (
    <>
      <Table
        rowKey={keyOf}
        size="small"
        loading={loading}
        dataSource={data}
        columns={columns}
        locale={{ emptyText: <EmptyAction description={emptyText} /> }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        onRow={(record) => ({
          onClick: () => drawer.show(record)
        })}
      />
      <Drawer title={drawerTitle || "详情"} open={drawer.open} onClose={drawer.close} width={520}>
        {drawer.record ? (
          <div className="detail-list">
            {Object.entries(drawer.record).map(([key, value]) => (
              <div className="detail-row" key={key}>
                <Typography.Text type="secondary">{key}</Typography.Text>
                <Typography.Text>{valueText(value)}</Typography.Text>
              </div>
            ))}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
