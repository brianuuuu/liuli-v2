import { Tabs } from "antd";

type ModuleTabsProps = {
  activeKey: string;
  items: { key: string; label: string }[];
  onChange: (key: string) => void;
};

export function ModuleTabs({ activeKey, items, onChange }: ModuleTabsProps) {
  return <Tabs activeKey={activeKey} items={items} onChange={onChange} className="module-tabs" />;
}
