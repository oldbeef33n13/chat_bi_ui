import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DataEndpointField, DataEndpointMeta, UpsertDataEndpointInput } from "../api/data-endpoint-repository";
import { HttpDataEndpointRepository } from "../api/http-data-endpoint-repository";
import { useDataEndpoints } from "../hooks/use-data-endpoints";

interface DataEndpointManagerPanelProps {
  open: boolean;
  onClose: () => void;
}

interface EndpointDraft {
  id?: string;
  name: string;
  category: string;
  providerType: "mock_rest" | "manual_rest" | "nl2sql_rest";
  origin: "system" | "manual" | "ai_generated";
  method: "GET" | "POST";
  path: string;
  description: string;
  enabled: boolean;
  paramSchemaText: string;
  resultSchemaText: string;
  sampleResponseText: string;
  testParamsText: string;
}

const defaultDraft = (): EndpointDraft => ({
  name: "",
  category: "custom",
  providerType: "manual_rest",
  origin: "manual",
  method: "GET",
  path: "",
  description: "",
  enabled: true,
  paramSchemaText: "[]",
  resultSchemaText: "[]",
  sampleResponseText: "[]",
  testParamsText: "{}"
});

const safeJsonParse = <T,>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

const toDraft = (endpoint: DataEndpointMeta): EndpointDraft => ({
  id: endpoint.id,
  name: endpoint.name,
  category: endpoint.category,
  providerType: endpoint.providerType,
  origin: endpoint.origin,
  method: endpoint.method,
  path: endpoint.path,
  description: endpoint.description,
  enabled: endpoint.enabled,
  paramSchemaText: JSON.stringify(endpoint.paramSchema ?? [], null, 2),
  resultSchemaText: JSON.stringify(endpoint.resultSchema ?? [], null, 2),
  sampleResponseText: JSON.stringify(endpoint.sampleResponse ?? [], null, 2),
  testParamsText: JSON.stringify(buildDefaultTestParams(endpoint.paramSchema), null, 2)
});

const buildDefaultTestParams = (fields: DataEndpointField[]): Record<string, unknown> =>
  fields.reduce<Record<string, unknown>>((result, field) => {
    result[field.name] = field.defaultValue ?? "";
    return result;
  }, {});

const toPayload = (draft: EndpointDraft): UpsertDataEndpointInput => ({
  name: draft.name.trim(),
  category: draft.category.trim(),
  providerType: draft.providerType,
  origin: draft.origin,
  method: draft.method,
  path: draft.path.trim(),
  description: draft.description.trim(),
  enabled: draft.enabled,
  paramSchema: safeJsonParse<DataEndpointField[]>(draft.paramSchemaText, []),
  resultSchema: safeJsonParse<DataEndpointField[]>(draft.resultSchemaText, []),
  sampleResponse: safeJsonParse<unknown>(draft.sampleResponseText, [])
});

export function DataEndpointManagerPanel({ open, onClose }: DataEndpointManagerPanelProps): JSX.Element | null {
  const repo = useMemo(() => new HttpDataEndpointRepository("/api/v1"), []);
  const { items, loading, error, refresh } = useDataEndpoints();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<EndpointDraft>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionHint, setActionHint] = useState("");
  const [testRows, setTestRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!selectedId && items[0]) {
      setSelectedId(items[0].id);
      setDraft(toDraft(items[0]));
    }
  }, [items, open, selectedId]);

  useEffect(() => {
    if (!open) {
      setActionError("");
      setActionHint("");
      setTestRows([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const filteredItems = items.filter((item) => {
    const haystack = `${item.name} ${item.id} ${item.category} ${item.description}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const selectItem = (endpoint: DataEndpointMeta): void => {
    setSelectedId(endpoint.id);
    setDraft(toDraft(endpoint));
    setActionError("");
    setActionHint("");
    setTestRows([]);
  };

  const resetNew = (): void => {
    setSelectedId(undefined);
    setDraft(defaultDraft());
    setActionError("");
    setActionHint("");
    setTestRows([]);
  };

  const saveEndpoint = async (): Promise<void> => {
    setSaving(true);
    setActionError("");
    setActionHint("");
    try {
      const payload = toPayload(draft);
      const saved = draft.id ? await repo.updateEndpoint(draft.id, payload) : await repo.createEndpoint(payload);
      await refresh();
      setSelectedId(saved.id);
      setDraft(toDraft(saved));
      setActionHint(draft.id ? "已更新数据接口" : "已创建数据接口");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (): Promise<void> => {
    if (!draft.id) {
      setActionError("请先保存接口，再测试取数");
      return;
    }
    setTesting(true);
    setActionError("");
    setActionHint("");
    try {
      const result = await repo.testEndpoint(draft.id, safeJsonParse<Record<string, unknown>>(draft.testParamsText, {}));
      setTestRows(result.rows);
      setActionHint(`测试成功，返回 ${result.rows.length} 行`);
    } catch (error) {
      setTestRows([]);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  return createPortal(
    <div className="overlay-shell" role="presentation">
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className="data-endpoint-panel" role="dialog" aria-modal="true" aria-label="数据接口管理">
        <div className="data-endpoint-panel-header row">
          <div className="col" style={{ gap: 2 }}>
            <strong>数据接口管理</strong>
            <span className="muted">统一管理 mock_rest / manual_rest / nl2sql_rest</span>
          </div>
          <div className="row">
            <button className="btn" onClick={resetNew}>
              新建
            </button>
            <button className="btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="data-endpoint-panel-body">
          <section className="data-endpoint-list">
            <div className="col">
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索接口" />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="chip">共 {items.length} 个</span>
                <button className="btn mini-btn" onClick={() => void refresh()}>
                  刷新
                </button>
              </div>
              {loading ? <div className="muted">加载中...</div> : null}
              {error ? <div className="chip" style={{ color: "#b91c1c" }}>{error}</div> : null}
              <div className="data-endpoint-list-scroll">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    className={`data-endpoint-item ${selectedId === item.id ? "active" : ""}`}
                    onClick={() => selectItem(item)}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{item.name}</strong>
                      <span className="chip">{item.providerType}</span>
                    </div>
                    <div className="muted">{item.id}</div>
                    <div className="muted">{item.path}</div>
                  </button>
                ))}
                {!loading && filteredItems.length === 0 ? <div className="muted">没有命中的数据接口</div> : null}
              </div>
            </div>
          </section>
          <section className="data-endpoint-editor">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{draft.id ? `编辑接口 · ${draft.id}` : "新建接口"}</strong>
              <div className="row">
                <button className="btn" onClick={() => void runTest()} disabled={testing}>
                  {testing ? "测试中..." : "测试取数"}
                </button>
                <button className="btn primary" onClick={() => void saveEndpoint()} disabled={saving}>
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
            {actionError ? <div className="chip" style={{ color: "#b91c1c" }}>{actionError}</div> : null}
            {actionHint ? <div className="chip">{actionHint}</div> : null}
            <div className="data-endpoint-form">
              <label className="col">
                <span>名称</span>
                <input className="input" value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="col">
                <span>分类</span>
                <input className="input" value={draft.category} onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))} />
              </label>
              <label className="col">
                <span>Provider</span>
                <select className="select" value={draft.providerType} onChange={(event) => setDraft((prev) => ({ ...prev, providerType: event.target.value as EndpointDraft["providerType"] }))}>
                  <option value="mock_rest">mock_rest</option>
                  <option value="manual_rest">manual_rest</option>
                  <option value="nl2sql_rest">nl2sql_rest</option>
                </select>
              </label>
              <label className="col">
                <span>Origin</span>
                <select className="select" value={draft.origin} onChange={(event) => setDraft((prev) => ({ ...prev, origin: event.target.value as EndpointDraft["origin"] }))}>
                  <option value="system">system</option>
                  <option value="manual">manual</option>
                  <option value="ai_generated">ai_generated</option>
                </select>
              </label>
              <label className="col">
                <span>Method</span>
                <select className="select" value={draft.method} onChange={(event) => setDraft((prev) => ({ ...prev, method: event.target.value as EndpointDraft["method"] }))}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </label>
              <label className="col">
                <span>Path</span>
                <input className="input" value={draft.path} onChange={(event) => setDraft((prev) => ({ ...prev, path: event.target.value }))} placeholder="/ops/demo" />
              </label>
              <label className="col data-endpoint-form-wide">
                <span>描述</span>
                <textarea className="textarea" value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
              </label>
              <label className="row">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))} />
                <span>启用</span>
              </label>
              <label className="col data-endpoint-form-wide">
                <span>paramSchema(JSON)</span>
                <textarea className="textarea code-textarea" value={draft.paramSchemaText} onChange={(event) => setDraft((prev) => ({ ...prev, paramSchemaText: event.target.value }))} />
              </label>
              <label className="col data-endpoint-form-wide">
                <span>resultSchema(JSON)</span>
                <textarea className="textarea code-textarea" value={draft.resultSchemaText} onChange={(event) => setDraft((prev) => ({ ...prev, resultSchemaText: event.target.value }))} />
              </label>
              <label className="col data-endpoint-form-wide">
                <span>sampleResponse(JSON)</span>
                <textarea className="textarea code-textarea" value={draft.sampleResponseText} onChange={(event) => setDraft((prev) => ({ ...prev, sampleResponseText: event.target.value }))} />
              </label>
              <label className="col data-endpoint-form-wide">
                <span>测试参数(JSON)</span>
                <textarea className="textarea code-textarea" value={draft.testParamsText} onChange={(event) => setDraft((prev) => ({ ...prev, testParamsText: event.target.value }))} />
              </label>
            </div>
            <div className="col">
              <strong>测试结果</strong>
              {testRows.length > 0 ? (
                <pre className="data-endpoint-result">{JSON.stringify(testRows.slice(0, 8), null, 2)}</pre>
              ) : (
                <div className="muted">暂无测试结果</div>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body
  );
}
