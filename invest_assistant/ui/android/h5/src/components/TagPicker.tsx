import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Tag } from "../types/api";

type TagPickerProps = {
  tags: Tag[];
  value: number[];
  onChange: (value: number[]) => void;
  label?: string;
};

export function TagPicker({ tags, value, onChange, label = "标签" }: TagPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const activeTags = useMemo(
    () => (Array.isArray(tags) ? tags : []).filter((tag) => tag.status !== "archived" && tag.status !== "disabled"),
    [tags]
  );
  const matches = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return activeTags
      .filter((tag) => !keyword || tag.name.toLocaleLowerCase().includes(keyword))
      .slice(0, 30);
  }, [activeTags, query]);

  function toggle(id: number) {
    onChange(selected.has(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  return (
    <div className="tag-picker">
      <span className="tag-picker__label">{label}</span>
      {value.length ? (
        <div className="tag-picker__selected">
          {value.map((id) => {
            const tag = tags.find((item) => item.id === id);
            return tag ? <button type="button" key={id} onClick={() => toggle(id)}>#{tag.name}<X size={13} /></button> : null;
          })}
        </div>
      ) : null}
      <div className="tag-picker__control">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="搜索并选择关联标签"
          aria-label="搜索标签"
          autoComplete="off"
        />
      </div>
      {open ? (
        <div className="tag-picker__options" role="listbox" aria-label="标签联想">
          {matches.length ? matches.map((tag) => (
            <button type="button" role="option" aria-selected={selected.has(tag.id)} key={tag.id} onClick={() => toggle(tag.id)}>
              <span>#{tag.name}</span>{selected.has(tag.id) ? <Check size={16} /> : null}
            </button>
          )) : <span className="tag-picker__empty">没有匹配的已有标签</span>}
          <button type="button" className="tag-picker__done" onClick={() => { setOpen(false); setQuery(""); }}>完成</button>
        </div>
      ) : null}
    </div>
  );
}
