export type SecondaryNavigationItem<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  items: readonly SecondaryNavigationItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
};

export function SecondaryNavigation<T extends string>({ items, activeKey, onChange }: Props<T>) {
  return (
    <div className="secondary-navigation" data-height="44" role="tablist" aria-label="二级导航">
      <div className="secondary-navigation__track">
        {items.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={item.key === activeKey}
            className={`secondary-navigation__item${item.key === activeKey ? " is-active" : ""}`}
            key={item.key}
            onClick={() => onChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
