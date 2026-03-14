import { useEffect, useState } from "react";
import type { EditorDocType, TemplateMeta } from "../api/template-repository";
import { preloadEditorChunk } from "../components/CanvasPanel";
import { DOC_TYPES, formatUiTime } from "./shared";

export function LibraryPage({
  docs,
  loading,
  error,
  filters,
  pageIndex,
  pageSize,
  total,
  onFiltersChange,
  onRetry,
  onOpen,
  onEdit,
  onOpenSchedule
}: {
  docs: TemplateMeta[];
  loading: boolean;
  error?: string;
  filters: { type: EditorDocType | "all"; q: string; page: number; pageSize: number };
  pageIndex: number;
  pageSize: number;
  total: number;
  onFiltersChange: (next: Partial<{ type: EditorDocType | "all"; q: string; page: number; pageSize: number }>) => void;
  onRetry: () => void;
  onOpen: (docId: string) => void;
  onEdit: (docId: string, docType: EditorDocType) => void;
  onOpenSchedule: (doc: Pick<TemplateMeta, "id" | "name" | "docType">) => void;
}): JSX.Element {
  const [keywordInput, setKeywordInput] = useState(filters.q);

  useEffect(() => {
    setKeywordInput(filters.q);
  }, [filters.q]);

  const canPrev = pageIndex > 1;
  const canNext = pageIndex * pageSize < total;

  return (
    <div className="library-shell">
      <div className="library-toolbar">
        <div className="tabs">
          {["all", ...DOC_TYPES].map((type) => (
            <button
              key={type}
              className={`tab-btn ${filters.type === type ? "active" : ""}`}
              onClick={() => onFiltersChange({ type: type as "all" | EditorDocType, page: 1 })}
            >
              {type === "all" ? "全部" : type}
            </button>
          ))}
        </div>
        <div className="row">
          <input
            className="input"
            style={{ maxWidth: 320 }}
            value={keywordInput}
            onChange={(event) => {
              const next = event.target.value;
              setKeywordInput(next);
              onFiltersChange({ q: next, page: 1 });
            }}
            placeholder="搜索标题、描述、标签"
          />
          <button className="btn" onClick={onRetry}>
            刷新
          </button>
        </div>
      </div>
      {error ? <div className="doc-empty">{error}</div> : null}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="chip">数据源: 后端 API</span>
        <span className="chip">
          第 {pageIndex} 页 / 共 {Math.max(1, Math.ceil(total / pageSize))} 页
        </span>
      </div>
      <div className="doc-grid">
        {loading ? <div className="doc-empty">文档列表加载中...</div> : null}
        {!loading && docs.length === 0 ? <div className="doc-empty">没有匹配文档</div> : null}
        {docs.map((item) => (
          <article key={item.id} className="doc-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{item.name}</strong>
              <span className="chip status-published">已发布</span>
            </div>
            <div className="muted">{item.description}</div>
            <div className="row">
              <span className="chip">{item.docType}</span>
              <span className="chip">更新于 {formatUiTime(item.updatedAt)}</span>
            </div>
            <div className="row">
              {item.tags.map((tag) => (
                <span key={`${item.id}_${tag}`} className="chip">
                  {tag}
                </span>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => onOpenSchedule(item)}>
                定时任务
              </button>
              <button className="btn" onClick={() => onOpen(item.id)}>
                查看详情
              </button>
              <button className="btn primary" onMouseEnter={() => preloadEditorChunk(item.docType)} onClick={() => onEdit(item.id, item.docType)}>
                进入编辑
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn" disabled={!canPrev} onClick={() => onFiltersChange({ page: pageIndex - 1 })}>
          上一页
        </button>
        <button className="btn" disabled={!canNext} onClick={() => onFiltersChange({ page: pageIndex + 1 })}>
          下一页
        </button>
      </div>
    </div>
  );
}
