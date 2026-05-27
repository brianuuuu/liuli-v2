import { CheckOutlined, CloseOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, InputNumber, Select, Space, Tag, Typography, message } from "antd";
import { useCallback, useMemo, useState } from "react";
import { createTrackMaterial, listTrackMaterials, listTracks, updateTrackMaterial } from "../../../api/trackDiscovery";
import type { TrackMaterialPayload } from "../../../api/trackDiscovery";
import { EmptyAction } from "../../../components/common/EmptyAction";
import { DataPanel } from "../../../components/common/DataPanel";
import { useAsyncData } from "../../../hooks/useAsyncData";
import type { TrackMaterial } from "../../../types/api";
import { DirectionTag, formatTime } from "./shared";
import {
  filterMaterialsByStatus,
  groupMaterialsByDate,
  materialDirectionLabel,
  materialDirectionOptions,
  materialImportanceLabel,
  materialImportanceOptions,
  materialStatusLabel,
  materialStatusOptions,
  materialTypeLabel,
  materialTypeOptions,
  pendingMaterials,
  type MaterialStatusFilter,
} from "./materialTimeline";

type MaterialFormValues = TrackMaterialPayload;

type DrawerMode = "create" | "edit";

export function MaterialsSection() {
  const tracks = useAsyncData(useCallback(() => listTracks(), []), []);
  const [trackId, setTrackId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("pending");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editingMaterial, setEditingMaterial] = useState<TrackMaterial | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm<MaterialFormValues>();
  const materials = useAsyncData(useCallback(() => (trackId ? listTrackMaterials(trackId) : Promise.resolve([])), [trackId]), []);

  const trackOptions = useMemo(() => tracks.data.map((item) => ({ value: item.id, label: item.name })), [tracks.data]);
  const activeTrack = useMemo(() => tracks.data.find((item) => item.id === trackId), [trackId, tracks.data]);
  const visibleMaterials = useMemo(() => filterMaterialsByStatus(materials.data, statusFilter), [materials.data, statusFilter]);
  const timelineGroups = useMemo(() => groupMaterialsByDate(visibleMaterials), [visibleMaterials]);
  const pendingRows = useMemo(() => pendingMaterials(materials.data), [materials.data]);
  const statusCounts = useMemo(() => {
    return materials.data.reduce(
      (acc, item) => {
        acc.all += 1;
        if (item.status === "pending") acc.pending += 1;
        if (item.status === "confirmed") acc.confirmed += 1;
        if (item.status === "ignored") acc.ignored += 1;
        return acc;
      },
      { pending: 0, confirmed: 0, ignored: 0, all: 0 }
    );
  }, [materials.data]);

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingMaterial(null);
    form.resetFields();
    form.setFieldsValue({ material_type: "source_item", status: "confirmed" });
    setDrawerOpen(true);
  }

  function openEditDrawer(record: TrackMaterial) {
    setDrawerMode("edit");
    setEditingMaterial(record);
    form.resetFields();
    form.setFieldsValue({
      material_type: record.material_type === "knowledge_note" ? "knowledge_note" : "source_item",
      material_id: record.material_id,
      direction: record.direction || null,
      importance_level: record.importance_level || null,
      status: record.status,
      note: record.note || null,
    });
    setDrawerOpen(true);
  }

  async function submitDrawer() {
    if (!trackId) {
      message.warning("请先选择赛道");
      return;
    }
    const values = await form.validateFields();
    if (drawerMode === "edit" && editingMaterial) {
      await updateTrackMaterial(editingMaterial.id, {
        direction: values.direction || null,
        importance_level: values.importance_level || null,
        status: values.status || "pending",
        note: values.note || null,
      });
      message.success("材料判断已更新");
    } else {
      await createTrackMaterial(trackId, {
        material_type: values.material_type,
        material_id: values.material_id,
        direction: values.direction || null,
        importance_level: values.importance_level || null,
        status: values.status || "confirmed",
        note: values.note || null,
      });
      message.success("材料已引用");
    }
    setDrawerOpen(false);
    setEditingMaterial(null);
    await materials.refresh();
  }

  async function updateStatus(record: TrackMaterial, status: string) {
    await updateTrackMaterial(record.id, { status });
    message.success(status === "confirmed" ? "材料已确认" : "材料已忽略");
    await materials.refresh();
  }

  function renderMaterialMeta(item: TrackMaterial) {
    return (
      <div className="track-material-meta">
        <span>{materialTypeLabel(item.material_type)}</span>
        <span>ID {item.material_id}</span>
        <DirectionTag direction={item.direction} />
        <Tag className="track-material-tag">{materialImportanceLabel(item.importance_level)}</Tag>
        <Tag className={`track-material-status ${item.status}`}>{materialStatusLabel(item.status)}</Tag>
      </div>
    );
  }

  return (
    <>
      <DataPanel
        toolbar={[
          <div className="track-material-toolbar" key="track-material-toolbar">
            <Select
              showSearch
              size="small"
              placeholder="选择赛道"
              value={trackId}
              options={trackOptions}
              loading={tracks.loading}
              style={{ width: 260 }}
              onChange={setTrackId}
            />
            <div className="data-panel-toolbar-divider" />
            <Space size={4} className="toolbar-status-buttons">
              {materialStatusOptions.map((item) => (
                <Button
                  key={item.value}
                  size="small"
                  className={statusFilter === item.value ? "toolbar-filter-button active" : "toolbar-filter-button"}
                  onClick={() => setStatusFilter(item.value)}
                >
                  {item.label} ({statusCounts[item.value]})
                </Button>
              ))}
            </Space>
            <div className="data-panel-toolbar-spacer" />
            <span className="track-material-context">{activeTrack ? activeTrack.name : "先选择赛道"}</span>
            <Button size="small" type="primary" icon={<PlusOutlined />} disabled={!trackId} onClick={openCreateDrawer}>
              引用材料
            </Button>
          </div>,
        ]}
      >
        {!trackId ? (
          <EmptyAction description="请选择赛道后查看发展时间轴和待处理材料" />
        ) : (
          <div className="track-material-workbench">
            <section className="track-material-timeline-panel">
              <div className="track-material-section-head">
                <div>
                  <Typography.Title level={5}>发展时间轴</Typography.Title>
                  <Typography.Text type="secondary">按材料更新时间倒序展示赛道判断变化</Typography.Text>
                </div>
                <span>{visibleMaterials.length} 条</span>
              </div>

              {timelineGroups.length ? (
                <div className="track-material-timeline">
                  {timelineGroups.map((group) => (
                    <div className="track-material-day" key={group.date}>
                      <div className="track-material-day-label">{group.date}</div>
                      {group.items.map((item) => (
                        <article className={`track-material-event ${item.status}`} key={item.id}>
                          <div className="track-material-event-rail" />
                          <div className="track-material-event-body">
                            <div className="track-material-event-head">
                              {renderMaterialMeta(item)}
                              <span className="track-material-time">{formatTime(item.updated_at || item.created_at)}</span>
                            </div>
                            <div className="track-material-note">{item.note || "尚未填写赛道视角判断"}</div>
                            <div className="track-material-actions">
                              <Button size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(item)}>编辑判断</Button>
                              {item.status === "pending" ? (
                                <>
                                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => updateStatus(item, "confirmed")}>确认</Button>
                                  <Button size="small" icon={<CloseOutlined />} onClick={() => updateStatus(item, "ignored")}>忽略</Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyAction description={statusFilter === "pending" ? "当前赛道没有待处理材料" : "当前筛选下没有赛道材料"} />
              )}
            </section>

            <aside className="track-material-pending-panel">
              <div className="track-material-section-head compact">
                <div>
                  <Typography.Title level={5}>待处理</Typography.Title>
                  <Typography.Text type="secondary">快速确认、忽略或补判断</Typography.Text>
                </div>
                <span>{pendingRows.length}</span>
              </div>
              {pendingRows.length ? (
                <div className="track-material-pending-list">
                  {pendingRows.map((item) => (
                    <article className="track-material-pending-card" key={item.id}>
                      {renderMaterialMeta(item)}
                      <div className="track-material-pending-note">{item.note || "待补充赛道视角判断"}</div>
                      <Space size={6}>
                        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => updateStatus(item, "confirmed")}>确认</Button>
                        <Button size="small" icon={<CloseOutlined />} onClick={() => updateStatus(item, "ignored")}>忽略</Button>
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(item)}>补判断</Button>
                      </Space>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyAction description="当前赛道没有待处理材料" />
              )}
            </aside>
          </div>
        )}
      </DataPanel>

      <Drawer
        title={drawerMode === "edit" ? "编辑材料判断" : "引用材料"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="large"
        extra={<Button type="primary" size="small" onClick={submitDrawer}>{drawerMode === "edit" ? "保存" : "引用"}</Button>}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Space.Compact block>
            <Form.Item name="material_type" label="来源" style={{ width: "50%" }} rules={[{ required: true, message: "请选择来源" }]}>
              <Select disabled={drawerMode === "edit"} options={materialTypeOptions} />
            </Form.Item>
            <Form.Item name="material_id" label="材料 ID" style={{ width: "50%" }} rules={[{ required: true, message: "请输入材料 ID" }]}>
              <InputNumber disabled={drawerMode === "edit"} min={1} style={{ width: "100%" }} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="direction" label="方向" style={{ width: "34%" }}>
              <Select allowClear options={materialDirectionOptions} />
            </Form.Item>
            <Form.Item name="importance_level" label="重要性" style={{ width: "33%" }}>
              <Select allowClear options={materialImportanceOptions} />
            </Form.Item>
            <Form.Item name="status" label="状态" style={{ width: "33%" }} rules={[{ required: true, message: "请选择状态" }]}>
              <Select options={materialStatusOptions.filter((item) => item.value !== "all")} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="note" label="赛道视角判断">
            <Input.TextArea rows={5} placeholder="用一句话说明这条材料对赛道判断的影响" />
          </Form.Item>
          <div className="track-material-drawer-hint">
            <Typography.Text type="secondary">材料原文仍归属信息流或知识库，这里只保存赛道视角下的引用和判断。</Typography.Text>
          </div>
        </Form>
      </Drawer>
    </>
  );
}
