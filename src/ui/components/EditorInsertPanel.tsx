import type { ReactNode } from "react";

export interface EditorInsertPanelItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  badge: string;
  draggable?: boolean;
  accent?: boolean;
  title?: string;
}

export interface EditorInsertPanelGroup<TItem extends EditorInsertPanelItem = EditorInsertPanelItem> {
  id: string;
  label: string;
  items: TItem[];
}

interface EditorInsertPanelProps<TItem extends EditorInsertPanelItem> {
  title: string;
  subtitle: string;
  search: string;
  placeholder: string;
  groups: EditorInsertPanelGroup<TItem>[];
  testId?: string;
  emptyText?: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onInsert: (item: TItem) => void;
  onDragStart?: (item: TItem, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (item: TItem) => void;
  renderItemExtra?: (item: TItem) => ReactNode;
}

export function EditorInsertPanel<TItem extends EditorInsertPanelItem>({
  title,
  subtitle,
  search,
  placeholder,
  groups,
  testId,
  emptyText = "没有匹配的组件",
  onSearchChange,
  onClose,
  onInsert,
  onDragStart,
  onDragEnd,
  renderItemExtra
}: EditorInsertPanelProps<TItem>): JSX.Element {
  const keyword = search.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!keyword) {
          return true;
        }
        return `${item.label} ${item.description} ${item.badge}`.toLowerCase().includes(keyword);
      })
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="editor-insert-panel" data-testid={testId}>
      <div className="editor-insert-panel-head row" style={{ justifyContent: "space-between" }}>
        <div className="col" style={{ gap: 2 }}>
          <strong>{title}</strong>
          <span className="muted">{subtitle}</span>
        </div>
        <button className="btn mini-btn" onClick={onClose} title="关闭插入面板">
          收起
        </button>
      </div>
      <input className="input editor-insert-search" placeholder={placeholder} value={search} onChange={(event) => onSearchChange(event.target.value)} />
      <div className="editor-insert-groups">
        {visibleGroups.length === 0 ? <div className="muted">{emptyText}</div> : null}
        {visibleGroups.map((group) => (
          <div key={group.id} className="editor-insert-group">
            <div className="editor-insert-group-title">{group.label}</div>
            <div className="editor-insert-group-grid">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`editor-insert-item ${item.accent ? "is-accent" : ""}`}
                  draggable={item.draggable !== false}
                  onDragStart={(event) => onDragStart?.(item, event)}
                  onDragEnd={() => onDragEnd?.(item)}
                  onClick={() => onInsert(item)}
                  title={item.title ?? "点击自动插入，也可拖到画布"}
                >
                  <span className="editor-insert-item-icon">{item.icon}</span>
                  <span className="editor-insert-item-name">{item.label}</span>
                  <span className="editor-insert-item-desc">{item.description}</span>
                  {renderItemExtra ? renderItemExtra(item) : null}
                  <span className="editor-insert-item-badge">{item.badge}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
