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
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
    return str.replace("T", " ").slice(0, 19);
  }
  return str;
}

export function RecordTable({ rowKey = "id", loading, data, columns, emptyText, drawerTitle }: RecordTableProps) {
  const drawer = useDrawerState<Record<string, unknown>>();
  const keyOf = (record: Record<string, unknown>, index?: number) => String(record[rowKey] ?? index ?? Math.random());

  const formattedColumns = columns.map((col) => {
    if (col.render) return col;
    return {
      ...col,
      render: (value: unknown) => {
        if (value === null || value === undefined || value === "") return "-";
        const str = String(value);
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
          return str.replace("T", " ").slice(0, 19);
        }
        return str;
      }
    };
  });

  return (
    <>
      <Table
        rowKey={keyOf}
        size="small"
        loading={loading}
        dataSource={data}
        columns={formattedColumns}
        locale={{ emptyText: <EmptyAction description={emptyText} /> }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        onRow={(record) => ({
          onClick: () => drawer.show(record)
        })}
      />
      <Drawer title={drawerTitle || "详情"} open={drawer.open} onClose={drawer.close} size={520}>
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
