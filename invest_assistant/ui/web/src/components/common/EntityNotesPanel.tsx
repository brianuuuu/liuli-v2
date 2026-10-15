import { Button, Form, Input, Modal, Select, Typography, message } from "antd";
import { useMemo, useState } from "react";
import { createKnowledgeNote } from "../../api/knowledge";
import type { KnowledgeNote } from "../../api/knowledge";
import type { TagBinding } from "../../types/api";
import { EmptyAction } from "./EmptyAction";
import { WorkbenchCard } from "./WorkbenchCard";

type NoteFormValues = { content: string; tag_ids: number[] };

function noteTime(value?: string | null) {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

/**
 * 标的、赛道详情里的笔记。
 *
 * 笔记与材料并列：笔记打的标签只要绑定在这个标的或赛道上，就出现在这里，不经材料引用、不需要确认。
 * 在这里记一笔就是写一条知识笔记，标签默认带上实体绑定的标签，保证写完立刻能归属回来。
 * 笔记是用户本人的重大想法，数量很少，全量平铺不分页。
 */
export function EntityNotesPanel({
  notes,
  tags,
  defaultTagName,
  onCreated
}: {
  notes: KnowledgeNote[];
  tags: TagBinding[];
  defaultTagName?: string | null;
  onCreated: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<NoteFormValues>();
  const tagOptions = useMemo(
    () => tags.filter((item) => item.status === "active").map((item) => ({ value: item.tag.id, label: `#${item.tag.name}` })),
    [tags]
  );

  function openComposer() {
    const active = tags.filter((item) => item.status === "active");
    const preferred = active.find((item) => item.tag.name === defaultTagName) ?? active[0];
    form.setFieldsValue({ content: "", tag_ids: preferred ? [preferred.tag.id] : [] });
    setOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createKnowledgeNote({ content: values.content.trim(), note_type: "", tag_ids: values.tag_ids, status: "active" });
      message.success("笔记已保存");
      setOpen(false);
      await onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkbenchCard>
      <div className="stock-detail-panel">
        <div className="stock-detail-panel-toolbar">
          <span>我的笔记</span>
          <Button size="small" type="primary" disabled={!tagOptions.length} onClick={openComposer}>记一笔</Button>
        </div>
        <div className="stock-detail-panel-section first">
          {!tagOptions.length ? (
            <EmptyAction description="还没有绑定标签，先在标签关系里绑定标签，笔记打上同一标签即可归属到这里" />
          ) : !notes.length ? (
            <EmptyAction description="暂无笔记。给笔记打上这里绑定的标签，就会出现在这里" />
          ) : (
            notes.map((note) => (
              <article className="knowledge-note-card" key={note.id}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{noteTime(note.created_at || note.updated_at)}</Typography.Text>
                <p className="knowledge-note-content">{note.content}</p>
                <div className="knowledge-note-meta">
                  {note.group ? <span className="meta-group-tag">{note.group.name}</span> : null}
                  {note.tags.map((tag) => <span key={tag.id} className="meta-tag-link">#{tag.name}</span>)}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
      <Modal title="记一笔" open={open} onCancel={() => setOpen(false)} onOk={submit} confirmLoading={saving} destroyOnHidden forceRender width={620}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="content" label="想法" rules={[{ required: true, whitespace: true, message: "请输入笔记内容" }]}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="写下现在的判断" />
          </Form.Item>
          <Form.Item name="tag_ids" label="标签" rules={[{ required: true, type: "array", min: 1, message: "至少选一个标签，笔记靠标签归属到这里" }]}>
            <Select mode="multiple" options={tagOptions} optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>
    </WorkbenchCard>
  );
}
