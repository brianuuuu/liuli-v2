import { Button, Drawer, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { getTagTrend, listRankings, type RankingType, type RankingWindow } from "../../../api/marketRadar";
import { ChartCard } from "../../../components/charts/ChartCard";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { WorkbenchCard } from "../../../components/common/WorkbenchCard";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TagHeat } from "../../../types/api";
import { formatTime, rankingTypeOptions, tagName, TagTypeTag, trendLineOption, windowOptions } from "./shared";

export function RankingsSection() {
  const [type, setType] = useState<RankingType>("hotword");
  const [window, setWindow] = useState<RankingWindow>("24h");
  const [selected, setSelected] = useState<TagHeat | null>(null);
  const [trend, setTrend] = useState<TagHeat[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const rankings = useAsyncData(useCallback(() => listRankings(type, window), [type, window]), []);

  async function showTrend(record: TagHeat) {
    setSelected(record);
    setTrendLoading(true);
    try {
      setTrend(await getTagTrend(record.tag_id));
    } finally {
      setTrendLoading(false);
    }
  }

  const columns: ColumnsType<TagHeat> = [
    { title: "排名", dataIndex: "rank_no", width: 72 },
    { title: "标签", render: (_, record) => tagName(record) },
    { title: "类型", width: 100, render: (_, record) => <TagTypeTag type={record.tag?.type} /> },
    { title: "热度", dataIndex: "heat_score", width: 100, render: (value) => Number(value || 0).toFixed(1) },
    { title: "触发", dataIndex: "trigger_count", width: 80 },
    { title: "来源", dataIndex: "source_count", width: 80 },
    { title: "变化", dataIndex: "change_ratio", width: 90, render: (value) => `${Number(value || 0).toFixed(2)}%` },
    { title: "统计时间", dataIndex: "stat_time", width: 160, render: formatTime },
    { title: "趋势", width: 80, render: (_, record) => <Button size="small" onClick={() => showTrend(record)}>查看</Button> }
  ];

  return (
    <>
      <WorkbenchCard
        title="热度榜"
        extra={
          <Space>
            <Select size="small" value={type} options={rankingTypeOptions} style={{ width: 110 }} onChange={setType} />
            <Select size="small" value={window} options={windowOptions} style={{ width: 90 }} onChange={setWindow} />
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={rankings.loading}
          dataSource={rankings.data}
          columns={columns}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          locale={{ emptyText: <EmptyAction description="暂无热度榜数据" /> }}
        />
      </WorkbenchCard>

      <Drawer title={selected ? `${tagName(selected)} 热度趋势` : "热度趋势"} open={Boolean(selected)} onClose={() => setSelected(null)} size={620}>
        {trend.length ? (
          <ChartCard title="历史热度" option={trendLineOption(trend, selected ? tagName(selected) : undefined)} height={300} />
        ) : (
          <WorkbenchCard title="历史热度">
            <EmptyAction description={trendLoading ? "加载中" : "暂无趋势数据"} />
          </WorkbenchCard>
        )}
      </Drawer>
    </>
  );
}
