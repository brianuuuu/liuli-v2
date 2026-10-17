import { Form, Input, Select } from "antd";
import type { FormInstance } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { approveAiTagSuggestion, listHotwords } from "../../../api/marketRadar";
import { searchStocks } from "../../../api/stocks";
import { listTracks } from "../../../api/trackDiscovery";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { AiTagSuggestion, Hotword, Stock, Track } from "../../../types/api";

export type TargetType = "stock" | "track" | "hotword";

export type SuggestionApproveValues = {
  final_tag_name?: string;
  target_type: TargetType;
  target_id?: number;
  target_name?: string;
};

type TargetSelectOption = {
  value: number;
  label: string;
  searchText: string;
};

export const targetTypeOptions = [
  { value: "hotword", label: "市场热词" },
  { value: "track", label: "赛道" },
  { value: "stock", label: "标的" }
];

export function suggestionApproveInitialValues(suggestion: AiTagSuggestion | null): SuggestionApproveValues {
  return { final_tag_name: suggestion?.final_tag_name || suggestion?.suggested_text, target_type: "hotword" };
}

/** 通过推荐词：AI 推荐词页的弹窗与工作台待办共用这一份提交逻辑。 */
export async function submitSuggestionApproval(suggestion: AiTagSuggestion, form: FormInstance<SuggestionApproveValues>) {
  const values = await form.validateFields();
  return approveAiTagSuggestion(suggestion.id, {
    final_tag_name: values.final_tag_name || null,
    target_type: values.target_type,
    target_id: values.target_id || null,
    target_name: values.target_name || values.final_tag_name || suggestion.suggested_text
  });
}

/**
 * 通过推荐词的表单项：最终标签词、绑定对象类型、已有对象、新对象名称。
 * 必须放在 <Form form={form}> 里；compact 时去掉说明文字，供待办详情栏内联使用。
 */
export function SuggestionApproveFields({ form, compact = false }: { form: FormInstance<SuggestionApproveValues>; compact?: boolean }) {
  const hotwords = useAsyncData(useCallback(async () => (await listHotwords(undefined, { limit: 100, offset: 0 })).items, []), []);
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [stockOptions, setStockOptions] = useState<Stock[]>([]);
  const [stockSearchLoading, setStockSearchLoading] = useState(false);
  const targetType: TargetType = Form.useWatch("target_type", form) || "hotword";

  useEffect(() => {
    form.setFieldValue("target_id", undefined);
    if (targetType !== "stock") setStockOptions([]);
  }, [form, targetType]);

  const options = useMemo(() => getTargetOptions(targetType, hotwords.data, tracks.data, stockOptions), [hotwords.data, stockOptions, targetType, tracks.data]);
  const loading = targetType === "stock" ? stockSearchLoading : targetType === "track" ? tracks.loading : hotwords.loading;
  const placeholder = targetType === "stock" ? "搜索标的名称 / 代码 / 拼音" : `搜索${targetTypeOptions.find((item) => item.value === targetType)?.label || "对象"}名称`;
  const extra = compact ? undefined : targetType === "stock" ? "标的必须从已有主数据中选择。" : "选择已有对象则绑定到该对象；不选择则按下方新对象名称创建。";

  async function searchTargetObjects(keyword: string) {
    if (targetType !== "stock") return;
    const value = keyword.trim();
    if (!value) {
      setStockOptions([]);
      return;
    }
    setStockSearchLoading(true);
    try {
      setStockOptions(await searchStocks(value));
    } finally {
      setStockSearchLoading(false);
    }
  }

  return (
    <>
      <Form.Item name="final_tag_name" label="最终标签词">
        <Input />
      </Form.Item>
      <Form.Item name="target_type" label="绑定对象" rules={[{ required: true, message: "请选择绑定对象" }]}>
        <Select options={targetTypeOptions} />
      </Form.Item>
      <Form.Item name="target_id" label="已有对象" extra={extra} rules={[{ required: targetType === "stock", message: "请搜索并选择已有标的" }]}>
        <Select
          allowClear
          showSearch
          optionFilterProp="searchText"
          filterOption={targetType === "stock" ? false : undefined}
          placeholder={placeholder}
          options={options}
          loading={loading}
          onSearch={searchTargetObjects}
          notFoundContent={targetType === "stock" ? (stockSearchLoading ? "搜索中" : "请输入名称或代码搜索") : "暂无可选对象"}
          popupMatchSelectWidth={360}
        />
      </Form.Item>
      <Form.Item name="target_name" label="新对象名称">
        <Input disabled={targetType === "stock"} placeholder={targetType === "stock" ? "标的需从已有主数据中选择" : "不选已有对象时按此名称新建"} />
      </Form.Item>
    </>
  );
}

function getTargetOptions(targetType: TargetType, hotwords: Hotword[], tracks: Track[], stocks: Stock[]): TargetSelectOption[] {
  if (targetType === "track") {
    return tracks.map((item) => ({
      value: item.id,
      label: item.name || "未命名赛道",
      searchText: [item.name, item.description, item.industry_phase, item.market_phase, item.status].filter(Boolean).join(" ")
    }));
  }
  if (targetType === "stock") {
    return stocks.map((item) => {
      const name = item.stock_name || item.name || item.stock_code || item.symbol || "未命名标的";
      return {
        value: item.id,
        label: name,
        searchText: [name, item.symbol, item.stock_code, item.name_pinyin, item.name_abbr, item.market, item.exchange].filter(Boolean).join(" ")
      };
    });
  }
  return hotwords.map((item) => ({
    value: item.id,
    label: item.name || "未命名热词",
    searchText: [item.name, item.description, item.status].filter(Boolean).join(" ")
  }));
}
