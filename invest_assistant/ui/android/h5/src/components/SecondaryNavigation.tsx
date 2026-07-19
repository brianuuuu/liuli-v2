export type SecondaryNavigationItem<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  items: readonly SecondaryNavigationItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  endAction?: {
    label: string;
    onClick: () => void;
  };
};

export function SecondaryNavigation<T extends string>({ items, activeKey, onChange, endAction }: Props<T>) {
  return (
    <div className="secondary-navigation" data-height="36" role="tablist" aria-label="二级导航">
      <div className="secondary-navigation__track" data-horizontal-scroll="true">
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
      {endAction ? (
        <button
          type="button"
          className="secondary-navigation__end-action"
          data-swipe-ignore="true"
          onClick={endAction.onClick}
        >
          {endAction.label}
        </button>
      ) : null}
    </div>
  );
}
