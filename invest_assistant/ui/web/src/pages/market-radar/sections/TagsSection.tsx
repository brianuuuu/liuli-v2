import { Button, Drawer, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { getTagTrend, listMarketTags } from "../../../api/marketRadar";
import { ChartCard } from "../../../components/charts/ChartCard";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { StatusTag } from "../../../components/common/StatusTag";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { MarketTag, TagHeat } from "../../../types/api";
import { formatTime, rankingTypeOptions, TagTypeTag, trendLineOption } from "./shared";

export function TagsSection() {
  const tags = useAsyncData(useCallback(listMarketTags, []), []);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selected, setSelected] = useState<MarketTag | null>(null);
  const [trend, setTrend] = useState<TagHeat[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const rows = useMemo(
    () => tags.data.filter((item) => (!typeFilter || item.type === typeFilter) && (!statusFilter || item.status === statusFilter)),
    [tags.data, typeFilter, statusFilter]
  );

  async function showTrend(record: MarketTag) {
    setSelected(record);
    setTrendLoading(true);
    try {
      setTrend(await getTagTrend(record.id));
    } finally {
      setTrendLoading(false);
    }
  }

  const columns: ColumnsType<MarketTag> = [
    { title: "名称", dataIndex: "name" },
    { title: "类型", dataIndex: "type", width: 110, render: (value) => <TagTypeTag type={value} /> },
    { title: "分类", dataIndex: "category", width: 130, render: (value) => value || "-" },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "Stock ID", dataIndex: "stock_id", width: 90, render: (value) => value || "-" },
    { title: "更新", dataIndex: "updated_at", width: 160, render: formatTime },
    { title: "趋势", width: 80, render: (_, record) => <Button size="small" onClick={() => showTrend(record)}>查看</Button> }
  ];

  return (
    <>
      <WorkbenchCard
        title="标签"
        extra={
          <Space>
            <Select allowClear size="small" placeholder="类型" value={typeFilter} options={rankingTypeOptions} style={{ width: 120 }} onChange={setTypeFilter} />
            <Select
              allowClear
              size="small"
              placeholder="状态"
              value={statusFilter}
              style={{ width: 110 }}
              onChange={setStatusFilter}
              options={[{ value: "active", label: "active" }, { value: "disabled", label: "disabled" }]}
            />
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={tags.loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无标签" /> }}
        />
      </WorkbenchCard>

      <Drawer title={selected ? `${selected.name} 热度趋势` : "热度趋势"} open={Boolean(selected)} onClose={() => setSelected(null)} size={620}>
        {trend.length ? (
          <ChartCard title="历史热度" option={trendLineOption(trend, selected?.name)} height={300} />
        ) : (
          <WorkbenchCard title="历史热度">
            <EmptyAction description={trendLoading ? "加载中" : "暂无趋势数据"} />
          </WorkbenchCard>
        )}
      </Drawer>
    </>
  );
}
