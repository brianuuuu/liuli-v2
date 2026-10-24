import { Form, Input, InputNumber, Modal, Select, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { listAdjustAdviceCandidates, updatePortfolioPositionChange } from "../../api/portfolio";
import type { AdjustAdviceCandidate, PortfolioPositionChange, PositionChangeReasonType } from "../../types/api";
import { adviceActionLabels, adviceCandidateLabel, reasonTypeOptions } from "./positionChangeLabels";

type FormValue = {
  change_date: string;
  price?: number | null;
  reason_type?: PositionChangeReasonType;
  advice_item_id?: number;
  note?: string;
};

type Props = {
  change: PortfolioPositionChange | null;
  portfolioName?: string;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * 修正一笔调仓：日期、成交价、理由来源、关联建议、调仓理由。
 * 股数和标的串着前后调仓与当前持仓，不在这里改；已同步的现金也不跟着改。
 */
export function PositionChangeEditModal({ change, portfolioName, onClose, onSaved }: Props) {
  const [form] = Form.useForm<FormValue>();
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<AdjustAdviceCandidate[]>([]);
  const reasonType = Form.useWatch("reason_type", form);
  const changeDate = Form.useWatch("change_date", form);

  useEffect(() => {
    if (!change || reasonType !== "ai_advice") {
      setCandidates([]);
      return;
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(changeDate || "") ? changeDate : change.change_date;
    let cancelled = false;
    listAdjustAdviceCandidates(change.stock_id, date, change.portfolio_id).then((rows) => {
      if (!cancelled) setCandidates(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [change, reasonType, changeDate]);

  if (!change) return null;
  const action = change.quantity_delta > 0 ? "add" : "reduce";
  // 只列同方向的建议；关联的是这笔调仓自己时照常可选，不算"已关联"
  const directional = candidates.filter((item) => item.action === action);
  const options = directional.map((item) => {
    const linkedElsewhere = Boolean(item.linked_change && item.linked_change.id !== change.id);
    return { value: item.id, disabled: linkedElsewhere, label: adviceCandidateLabel(item, linkedElsewhere) };
  });
  // 改了日期后原关联的建议可能不在近 10 天候选里，仍保留这一项，免得下拉只显示一个数字 ID
  if (change.advice_item_id && !options.some((item) => item.value === change.advice_item_id)) {
    options.unshift({
      value: change.advice_item_id,
      disabled: false,
      label: `${change.advice_target_trade_date ?? ""} ${adviceActionLabels[change.advice_action ?? ""] || ""}（当前关联）`.trim()
    });
  }
  const corporateAction = reasonType === "corporate_action";
  const estimated = change.price_source === "estimated";

  async function submit() {
    if (!change) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await updatePortfolioPositionChange(change.portfolio_id, change.id, {
        change_date: values.change_date,
        price: corporateAction ? null : values.price ?? null,
        reason_type: values.reason_type ?? null,
        advice_item_id: values.reason_type === "ai_advice" ? values.advice_item_id ?? null : null,
        note: values.note || null
      });
      message.success("调仓记录已更新");
      onSaved();
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      message.error(typeof detail === "string" ? `保存失败：${detail}` : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const delta = change.quantity_delta;
  return (
    <Modal title={`编辑调仓${portfolioName ? ` · ${portfolioName}` : ""}`} open onCancel={onClose} onOk={submit} confirmLoading={saving} destroyOnClose>
      <Typography.Paragraph type="secondary">
        {change.stock_name || change.stock_code} {change.stock_code && change.stock_name ? change.stock_code : ""} · {delta > 0 ? "+" : "−"}
        {Math.abs(delta).toLocaleString("zh-CN")} 股。股数和标的不能改，记错了请在实盘持仓再调一次；改价格或日期不会回改已同步的现金，差额用现金校准。
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          change_date: change.change_date,
          // 估算价不回填：留空保存表示继续按调仓日收盘价估算，改了日期会按新日期重估
          price: estimated ? null : change.price ?? null,
          reason_type: change.reason_type ?? undefined,
          advice_item_id: change.advice_item_id ?? undefined,
          note: change.note ?? ""
        }}
      >
        <Form.Item
          name="change_date"
          label="调仓日期"
          rules={[
            { required: true, message: "请输入调仓日期" },
            { pattern: /^\d{4}-\d{2}-\d{2}$/, message: "格式为 YYYY-MM-DD" }
          ]}
        >
          <Input placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          name="price"
          label="成交价"
          extra={corporateAction ? "公司行为不记价格" : estimated && change.price ? `当前为估算价 ${change.price}；留空按调仓日收盘价估算` : "留空按调仓日收盘价估算"}
        >
          <InputNumber min={0} precision={3} style={{ width: "100%" }} disabled={corporateAction} placeholder="实际成交价，选填" />
        </Form.Item>
        <Form.Item name="reason_type" label="理由来源">
          <Select allowClear placeholder="选填，用于复盘对比 AI 建议和个人判断" options={reasonTypeOptions} />
        </Form.Item>
        {reasonType === "ai_advice" ? (
          <Form.Item
            name="advice_item_id"
            label="关联微操建议"
            extra={options.length ? "关联后，这笔调仓直接算作该建议已执行；一条建议只能关联一次" : `近 10 天没有这只标的${adviceActionLabels[action]}建议，可不关联`}
          >
            <Select allowClear placeholder="选填" options={options} />
          </Form.Item>
        ) : null}
        <Form.Item name="note" label="调仓理由">
          <Input.TextArea rows={3} placeholder="选填" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
