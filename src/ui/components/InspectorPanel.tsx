import { useEffect, useState } from "react";
import type { ChartSpec, FieldBinding, VDoc, VNode } from "../../core/doc/types";
import { applyComputedFields, applyFilters } from "../../runtime/data/transforms";
import { prefixedId } from "../../core/utils/id";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { themes } from "../../runtime/theme/themes";
import { chartTypeOptions, extractSourceFields, recommendBindings, recommendChartConfig } from "../utils/chart-recommend";
import { summarizeChartRows } from "../utils/chart-summary";
import { StyleInheritancePanel } from "./StyleInheritancePanel";
import type { Persona } from "../types/persona";

type InspectorMode = "quick" | "standard" | "expert";

export function InspectorPanel({ persona = "analyst" }: { persona?: Persona }): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const error = useSignalValue(store.lastError);
  const [mode, setMode] = useState<InspectorMode>(modeByPersona(persona));

  useEffect(() => {
    setMode(modeByPersona(persona));
  }, [persona]);

  if (!doc) {
    return <div className="panel-body muted">No document loaded.</div>;
  }

  const node = selection.primaryId ? findNodeById(doc.root, selection.primaryId) : undefined;
  const text = node?.kind === "text" ? String((node.props as Record<string, unknown>)?.text ?? "") : "";

  return (
    <>
      <div className="panel-header">
        <div className="row" style={{ gap: 6 }}>
          <span>Inspector</span>
          <span className="muted">{selection.primaryId ?? "未选中"}</span>
        </div>
        <div className="row">
          <button className={`tab-btn ${mode === "quick" ? "active" : ""}`} onClick={() => setMode("quick")}>
            快捷
          </button>
          <button className={`tab-btn ${mode === "standard" ? "active" : ""}`} onClick={() => setMode("standard")}>
            标准
          </button>
          <button className={`tab-btn ${mode === "expert" ? "active" : ""}`} onClick={() => setMode("expert")}>
            专家
          </button>
          <button className="btn" onClick={() => store.undo()}>
            回退
          </button>
        </div>
      </div>
      <div className="panel-body">
        {error ? (
          <div className="col" style={{ marginBottom: 10 }}>
            <div className="chip" style={{ color: "#b91c1c" }}>
              {error}
            </div>
            <button className="btn" onClick={() => store.clearError()}>
              清除
            </button>
          </div>
        ) : null}

        {!node ? (
          <div className="muted">选择一个节点后可编辑属性。</div>
        ) : (
          <div className="col">
            <label className="col">
              <span>Node ID</span>
              <input className="input" value={node.id} disabled />
            </label>
            <label className="col">
              <span>Kind</span>
              <input className="input" value={node.kind} disabled />
            </label>
            <label className="col">
              <span>Name</span>
              <input className="input" value={node.name ?? ""} disabled />
            </label>

            {node.kind === "chart" ? <ChartInspector doc={doc} node={node} mode={mode} persona={persona} /> : null}

            {node.kind === "text" ? (
              <label className="col">
                <span>Text</span>
                <textarea
                  className="textarea"
                  value={text}
                  onChange={(event) =>
                    store.executeCommand(
                      {
                        type: "UpdateProps",
                        nodeId: node.id,
                        props: { text: event.target.value }
                      },
                      { summary: "edit text", mergeWindowMs: 140 }
                    )
                  }
                />
              </label>
            ) : null}

            <LayoutEditor node={node} />
            <StyleInheritancePanel doc={doc} node={node} />

            <div className="row">
              <button
                className="btn"
                onClick={() =>
                  store.executeCommand(
                    {
                      type: "UpdateStyle",
                      nodeId: node.id,
                      style: { bg: "#f8fbff", borderW: 1, borderC: "#dbeafe", radius: 8 }
                    },
                    { summary: "style preset" }
                  )
                }
              >
                样式预设
              </button>
              <button
                className="btn danger"
                onClick={() => store.executeCommand({ type: "RemoveNode", nodeId: node.id }, { summary: "remove in inspector" })}
              >
                删除节点
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ChartInspector({ doc, node, mode, persona }: { doc: VDoc; node: VNode; mode: InspectorMode; persona: Persona }): JSX.Element {
  const store = useEditorStore();
  const props = (node.props ?? { chartType: "line", bindings: [] }) as ChartSpec;
  const bindings = props.bindings ?? [];
  const data = node.data;
  const [recommendHint, setRecommendHint] = useState("");
  const [optionPatchText, setOptionPatchText] = useState("{}");
  const [rawSpecText, setRawSpecText] = useState("{}");
  const [rawDataText, setRawDataText] = useState("{}");
  const [paletteText, setPaletteText] = useState("");
  const [summaryHint, setSummaryHint] = useState("");

  const sourceOptions = doc.dataSources ?? [];
  const sourceId = data?.sourceId ?? sourceOptions[0]?.id ?? "";
  const source = sourceOptions.find((item) => item.id === sourceId);
  const fields = extractSourceFields(source);
  const recommend = recommendChartConfig((props.chartType ?? "line") as ChartSpec["chartType"], fields);
  const xBinding = bindings.find((binding) => binding.role === "x" || binding.role === "category");
  const yBindings = bindings.filter((binding) => binding.role === "y" || binding.role === "value");
  const computedFields = props.computedFields ?? [];
  const primaryY = yBindings[0];
  const secondY = yBindings[1];
  const fieldOptions = fields.map((field) => field.name);
  const numericFields = fields.filter((field) => field.type === "number").map((field) => field.name);
  const previewRows = getPreviewRows(doc, node, props);

  useEffect(() => {
    setOptionPatchText(JSON.stringify(props.optionPatch ?? {}, null, 2));
    setRawSpecText(JSON.stringify(props, null, 2));
    setRawDataText(JSON.stringify(data ?? {}, null, 2));
    setPaletteText(Array.isArray((props.optionPatch as Record<string, unknown> | undefined)?.color) ? ((props.optionPatch as Record<string, unknown>).color as unknown[]).map((item) => String(item)).join(", ") : "");
    setRecommendHint("");
    setSummaryHint("");
  }, [node.id, props.optionPatch]);

  const updateProps = (partial: Partial<ChartSpec>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: node.id,
        props: partial as unknown as Record<string, unknown>
      },
      { summary, mergeWindowMs }
    );
  };

  const updateData = (partial: Record<string, unknown>, summary: string): void => {
    store.executeCommand(
      {
        type: "UpdateData",
        nodeId: node.id,
        data: partial
      },
      { summary }
    );
  };

  const setBindings = (bindings: FieldBinding[], summary: string): void => {
    updateProps({ bindings }, summary);
  };

  const addComputedField = (): void => {
    const next = [...computedFields, { name: `calc_${computedFields.length + 1}`, expression: "1+1" }];
    updateProps({ computedFields: next }, "add computed field");
  };

  const updateComputedField = (index: number, patch: Partial<{ name: string; expression: string }>): void => {
    const next = computedFields.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
    updateProps({ computedFields: next }, "update computed field");
  };

  const removeComputedField = (index: number): void => {
    const next = computedFields.filter((_, idx) => idx !== index);
    updateProps({ computedFields: next }, "remove computed field");
  };

  const upsertBinding = (role: FieldBinding["role"], patch: Partial<FieldBinding>): void => {
    const current = [...bindings];
    const index = current.findIndex((item) => item.role === role);
    if (index >= 0) {
      current[index] = { ...current[index], ...patch } as FieldBinding;
    } else if (patch.field) {
      current.push({ ...(patch as FieldBinding), role, field: patch.field });
    }
    setBindings(current, `update binding ${role}`);
  };

  const setPrimaryYField = (field: string): void => {
    const current = [...bindings];
    const yIndex = current.findIndex((item) => item.role === "y" || item.role === "value");
    if (yIndex >= 0) {
      current[yIndex] = { ...current[yIndex], role: "y", field };
      setBindings(current, "change y field");
      return;
    }
    current.push({ role: "y", field, agg: "sum" });
    setBindings(current, "add y field");
  };

  const setPrimaryAgg = (agg: FieldBinding["agg"]): void => {
    const current = [...bindings];
    const yIndex = current.findIndex((item) => item.role === "y" || item.role === "value");
    if (yIndex < 0) {
      return;
    }
    const existing = current[yIndex];
    if (!existing) {
      return;
    }
    current[yIndex] = { ...existing, role: "y", agg };
    setBindings(current, "change agg");
  };

  const setSecondAxis = (enabled: boolean): void => {
    const current = [...bindings];
    const yIndices = current
      .map((item, idx) => ({ item, idx }))
      .filter((entry) => entry.item.role === "y" || entry.item.role === "value")
      .map((entry) => entry.idx);
    if (!enabled) {
      if (yIndices.length <= 1) {
        return;
      }
      const next = current.filter((_, idx) => idx !== yIndices[1]);
      setBindings(next, "remove second axis");
      return;
    }
    if (yIndices.length >= 2) {
      return;
    }
    const candidate = numericFields.find((field) => field !== primaryY?.field) ?? numericFields[0];
    if (!candidate) {
      return;
    }
    current.push({ role: "y", field: candidate, agg: "sum", as: "secondary" });
    setBindings(current, "add second axis");
  };

  const setSecondAxisField = (field: string): void => {
    const current = [...bindings];
    const yIndices = current
      .map((item, idx) => ({ item, idx }))
      .filter((entry) => entry.item.role === "y" || entry.item.role === "value")
      .map((entry) => entry.idx);
    if (yIndices.length < 2) {
      return;
    }
    const idx = yIndices[1]!;
    current[idx] = { ...current[idx], role: "y", field, as: "secondary" };
    setBindings(current, "change second axis field");
  };

  const setSourceAndRecommend = (nextSourceId: string): void => {
    const nextSource = sourceOptions.find((item) => item.id === nextSourceId);
    const nextFields = extractSourceFields(nextSource);
    const nextRecommend = recommendChartConfig((props.chartType ?? "line") as ChartSpec["chartType"], nextFields);
    const nextQueryId = doc.queries?.find((query) => query.sourceId === nextSourceId)?.queryId;
    store.executeCommand(
      {
        type: "Transaction",
        commands: [
          {
            type: "UpdateData",
            nodeId: node.id,
            data: {
              sourceId: nextSourceId,
              queryId: nextQueryId
            }
          },
          {
            type: "UpdateProps",
            nodeId: node.id,
            props: {
              bindings: nextRecommend.bindings
            }
          }
        ]
      },
      { summary: "source change and bindings recommend" }
    );
    setRecommendHint(nextRecommend.reasons.join("；"));
  };

  const autoRecommendBindings = (): void => {
    const nextBindings = recommendBindings((props.chartType ?? "line") as ChartSpec["chartType"], fields);
    updateProps({ bindings: nextBindings }, "auto recommend bindings");
    setRecommendHint(recommend.reasons.join("；"));
  };

  const applySmartTypeRecommend = (): void => {
    store.executeCommand(
      {
        type: "Transaction",
        commands: [
          {
            type: "UpdateProps",
            nodeId: node.id,
            props: {
              chartType: recommend.chartType,
              bindings: recommend.bindings
            }
          }
        ]
      },
      { summary: "smart type recommend" }
    );
    setRecommendHint(recommend.reasons.join("；"));
  };

  const rollbackRecommend = (): void => {
    store.undo();
    setRecommendHint("已回退上一次推荐修改");
  };

  const applyOptionPatch = (): void => {
    try {
      const parsed = JSON.parse(optionPatchText) as Record<string, unknown>;
      updateProps({ optionPatch: parsed }, "apply optionPatch");
    } catch {
      setRecommendHint("optionPatch JSON 解析失败");
    }
  };

  const applyRawSpec = (): void => {
    try {
      const parsed = JSON.parse(rawSpecText) as ChartSpec;
      updateProps(parsed, "apply raw spec");
    } catch {
      setRecommendHint("Raw Spec JSON 解析失败");
    }
  };

  const applyRawData = (): void => {
    try {
      const parsed = JSON.parse(rawDataText) as Record<string, unknown>;
      updateData(parsed, "apply raw data");
    } catch {
      setRecommendHint("Raw Data JSON 解析失败");
    }
  };

  const applyCustomPalette = (): void => {
    const colors = paletteText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const nextPatch: Record<string, unknown> = { ...(props.optionPatch ?? {}) };
    if (colors.length === 0) {
      delete nextPatch.color;
    } else {
      nextPatch.color = colors;
    }
    updateProps({ optionPatch: nextPatch }, "chart custom palette");
  };

  const buildSummary = (): string => summarizeChartRows(props, previewRows);

  const applySummaryToSubtitle = (): void => {
    const summary = buildSummary();
    updateProps({ subtitleText: summary }, "auto summary subtitle");
    setSummaryHint("已写入图表副标题");
  };

  const insertSummaryTextBlock = (): void => {
    const summary = buildSummary();
    const inserted = insertSummaryNode(doc, node, summary, (command, summaryText) => store.executeCommand(command, { summary: summaryText }));
    if (!inserted) {
      updateProps({ subtitleText: summary }, "auto summary fallback subtitle");
      setSummaryHint("未找到可插入位置，已回退为副标题写入");
      return;
    }
    setSummaryHint("已插入结论文本块");
  };

  return (
    <div className="col">
      <label className="col">
        <span>Chart Type</span>
        <select className="select" value={props.chartType ?? "line"} onChange={(event) => updateProps({ chartType: event.target.value as ChartSpec["chartType"] }, "chart type change")}>
          {chartTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="col">
        <span>Title</span>
        <input className="input" value={String(props.titleText ?? "")} onChange={(event) => updateProps({ titleText: event.target.value }, "chart title change", 140)} />
      </label>
      <label className="col">
        <span>Data Source</span>
        <select className="select" value={sourceId} onChange={(event) => setSourceAndRecommend(event.target.value)} disabled={sourceOptions.length === 0}>
          {sourceOptions.length > 0 ? (
            sourceOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))
          ) : (
            <option value="">无数据源</option>
          )}
        </select>
      </label>
      <div className="row">
        <button className="btn primary" onClick={applySmartTypeRecommend}>
          智能类型推荐
        </button>
        <button className="btn" onClick={autoRecommendBindings}>
          自动字段推荐
        </button>
        {recommendHint ? (
          <button className="btn" onClick={rollbackRecommend}>
            一键回退推荐
          </button>
        ) : null}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        字段识别: {fields.slice(0, 4).map((field) => `${field.name}:${field.type}`).join(", ") || "无字段"}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        推荐解释: {recommendHint || recommend.reasons.join("；")}
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>自动总结</strong>
          <span className="muted">样本 {previewRows.length} 行</span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {buildSummary()}
        </div>
        <div className="row">
          <button className="btn" onClick={applySummaryToSubtitle}>
            写入副标题
          </button>
          <button className="btn" onClick={insertSummaryTextBlock}>
            插入总结文本块
          </button>
        </div>
        {summaryHint ? <div className="muted">{summaryHint}</div> : null}
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <strong>快捷样式</strong>
        <div className="row">
          <button className="btn" onClick={() => updateProps({ themeRef: "theme.tech.dark", paletteRef: "palette.tech.dark" }, "quick dark theme")}>
            一键深色主题
          </button>
          <button className="btn" onClick={() => updateProps({ gridShow: false }, "quick no grid")}>
            一键无网格
          </button>
          <button className="btn" onClick={() => updateProps({ labelShow: true }, "quick labels on")}>
            一键数据标签开启
          </button>
        </div>
      </div>

      {mode !== "quick" ? (
        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <strong>字段绑定</strong>
          <label className="col">
            <span>X 轴字段</span>
            <select className="select" value={xBinding?.field ?? ""} onChange={(event) => upsertBinding("x", { field: event.target.value })}>
              <option value="">请选择</option>
              {fieldOptions.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </label>
          <label className="col">
            <span>Y 轴字段</span>
            <select className="select" value={primaryY?.field ?? ""} onChange={(event) => setPrimaryYField(event.target.value)}>
              <option value="">请选择</option>
              {numericFields.length > 0
                ? numericFields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))
                : fieldOptions.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
            </select>
          </label>
          <label className="col">
            <span>聚合方式</span>
            <select className="select" value={primaryY?.agg ?? "sum"} onChange={(event) => setPrimaryAgg(event.target.value as FieldBinding["agg"])}>
              {["sum", "avg", "min", "max", "count", "distinctCount", "p50", "p95", "p99"].map((agg) => (
                <option key={agg} value={agg}>
                  {agg}
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={Boolean(secondY)} onChange={(event) => setSecondAxis(event.target.checked)} />
            <span>添加第二轴</span>
          </label>
          {secondY ? (
            <label className="col">
              <span>第二轴字段</span>
              <select className="select" value={secondY.field} onChange={(event) => setSecondAxisField(event.target.value)}>
                {numericFields.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {mode !== "quick" ? (
        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>计算字段</strong>
            <button className="btn" onClick={addComputedField}>
              +计算字段
            </button>
          </div>
          {computedFields.length === 0 ? <div className="muted">暂无计算字段</div> : null}
          {computedFields.map((field, idx) => (
            <div key={`${field.name}_${idx}`} className="row">
              <input
                className="input"
                placeholder="字段名"
                value={field.name}
                onChange={(event) => updateComputedField(idx, { name: event.target.value })}
              />
              <input
                className="input"
                placeholder="表达式，例如: bytes / 1024"
                value={field.expression}
                onChange={(event) => updateComputedField(idx, { expression: event.target.value })}
              />
              <button className="btn danger" onClick={() => removeComputedField(idx)}>
                删除
              </button>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 12 }}>
            表达式支持数字运算和字段名引用，例如 `in_bps / out_bps`。
          </div>
        </div>
      ) : null}

      {mode !== "quick" ? (
        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <strong>主题与配色</strong>
          <label className="col">
            <span>主题</span>
            <select className="select" value={props.themeRef ?? ""} onChange={(event) => updateProps({ themeRef: event.target.value }, "chart theme switch")}>
              <option value="">跟随文档</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col">
            <span>配色</span>
            <select className="select" value={props.paletteRef ?? ""} onChange={(event) => updateProps({ paletteRef: event.target.value }, "chart palette switch")}>
              <option value="">默认</option>
              <option value="palette.tech">palette.tech</option>
              <option value="palette.tech.dark">palette.tech.dark</option>
              <option value="palette.business">palette.business</option>
            </select>
          </label>
          {persona === "designer" || mode === "expert" ? (
            <label className="col">
              <span>自定义调色板（逗号分隔）</span>
              <input className="input" value={paletteText} onChange={(event) => setPaletteText(event.target.value)} placeholder="#2563eb, #22c55e, #f59e0b" />
              <button className="btn" onClick={applyCustomPalette}>
                应用自定义色板
              </button>
            </label>
          ) : null}
        </div>
      ) : null}

      {mode === "expert" ? (
        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <strong>专家模式</strong>
          <label className="col">
            <span>optionPatch(JSON)</span>
            <textarea className="textarea" value={optionPatchText} onChange={(event) => setOptionPatchText(event.target.value)} />
            <button className="btn" onClick={applyOptionPatch}>
              应用 optionPatch
            </button>
          </label>
          <label className="col">
            <span>Raw ChartSpec(JSON)</span>
            <textarea className="textarea" value={rawSpecText} onChange={(event) => setRawSpecText(event.target.value)} />
            <button className="btn" onClick={applyRawSpec}>
              应用 ChartSpec
            </button>
          </label>
          <label className="col">
            <span>Raw DataBinding(JSON)</span>
            <textarea className="textarea" value={rawDataText} onChange={(event) => setRawDataText(event.target.value)} />
            <button className="btn" onClick={applyRawData}>
              应用 DataBinding
            </button>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function LayoutEditor({ node }: { node: VNode }): JSX.Element {
  const store = useEditorStore();
  const layout = (node.layout ?? {}) as Record<string, unknown>;
  const mode = (layout.mode as string | undefined) ?? "flow";
  const isGrid = mode === "grid";
  const isAbsolute = mode === "absolute";

  const update = (key: string, value: number | string): void => {
    store.executeCommand(
      {
        type: "UpdateLayout",
        nodeId: node.id,
        layout: { [key]: value }
      },
      { summary: `layout ${key}`, mergeWindowMs: 140 }
    );
  };

  return (
    <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
      <strong>Layout</strong>
      <label className="col">
        <span>Mode</span>
        <select className="select" value={mode} onChange={(event) => update("mode", event.target.value)}>
          {["flow", "grid", "absolute"].map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>

      {isGrid ? (
        <div className="row">
          <NumberInput label="gx" value={Number(layout["gx"] ?? 0)} onChange={(value) => update("gx", value)} />
          <NumberInput label="gy" value={Number(layout["gy"] ?? 0)} onChange={(value) => update("gy", value)} />
          <NumberInput label="gw" value={Number(layout["gw"] ?? 4)} onChange={(value) => update("gw", value)} />
          <NumberInput label="gh" value={Number(layout["gh"] ?? 4)} onChange={(value) => update("gh", value)} />
        </div>
      ) : null}

      {isAbsolute ? (
        <div className="row">
          <NumberInput label="x" value={Number(layout["x"] ?? 0)} onChange={(value) => update("x", value)} />
          <NumberInput label="y" value={Number(layout["y"] ?? 0)} onChange={(value) => update("y", value)} />
          <NumberInput label="w" value={Number(layout["w"] ?? 200)} onChange={(value) => update("w", value)} />
          <NumberInput label="h" value={Number(layout["h"] ?? 120)} onChange={(value) => update("h", value)} />
        </div>
      ) : null}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="col" style={{ minWidth: 60 }}>
      <span>{label}</span>
      <input className="input" type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

const findNodeById = (root: VNode, nodeId: string): VNode | undefined => {
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNodeById(child, nodeId);
    if (found) {
      return found;
    }
  }
  return undefined;
};

const modeByPersona = (persona: Persona): InspectorMode => {
  switch (persona) {
    case "novice":
      return "quick";
    case "designer":
      return "expert";
    case "analyst":
    case "ai":
    default:
      return "standard";
  }
};

const getPreviewRows = (doc: VDoc, node: VNode, spec: ChartSpec): Array<Record<string, unknown>> => {
  const sourceId = node.data?.sourceId;
  const source = doc.dataSources?.find((item) => item.id === sourceId);
  if (!source || source.type !== "static" || !Array.isArray(source.staticData)) {
    return [];
  }
  const baseRows = source.staticData.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  const withComputed = applyComputedFields(baseRows, spec);
  return applyFilters(withComputed, doc.filters ?? [], node);
};

const findParentAndIndex = (root: VNode, targetId: string): { parent: VNode; index: number } | undefined => {
  const children = root.children ?? [];
  const index = children.findIndex((item) => item.id === targetId);
  if (index >= 0) {
    return { parent: root, index };
  }
  for (const child of children) {
    const nested = findParentAndIndex(child, targetId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
};

const findAncestorKind = (root: VNode, targetId: string, kind: string): VNode | undefined => {
  const dfs = (node: VNode, stack: VNode[]): VNode | undefined => {
    if (node.id === targetId) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.kind === kind) {
          return stack[i];
        }
      }
      return node.kind === kind ? node : undefined;
    }
    for (const child of node.children ?? []) {
      const found = dfs(child, [...stack, node]);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return dfs(root, []);
};

const insertSummaryNode = (
  doc: VDoc,
  chartNode: VNode,
  summary: string,
  execute: (command: { type: "InsertNode"; parentId: string; index?: number; node: VNode }, summary: string) => boolean
): boolean => {
  if (doc.docType === "dashboard") {
    const root = doc.root;
    const maxGy = Math.max(
      0,
      ...(root.children ?? []).map((item) => Number(item.layout?.mode === "grid" ? (item.layout.gy ?? 0) + (item.layout.gh ?? 4) : 0))
    );
    return execute(
      {
        type: "InsertNode",
        parentId: root.id,
        node: {
          id: prefixedId("text"),
          kind: "text",
          layout: { mode: "grid", gx: 0, gy: maxGy, gw: 12, gh: 2 },
          props: { text: summary, format: "plain" }
        }
      },
      "insert dashboard summary"
    );
  }

  if (doc.docType === "report") {
    const parentInfo = findParentAndIndex(doc.root, chartNode.id);
    if (!parentInfo) {
      return false;
    }
    return execute(
      {
        type: "InsertNode",
        parentId: parentInfo.parent.id,
        index: parentInfo.index + 1,
        node: {
          id: prefixedId("text"),
          kind: "text",
          props: { text: summary, format: "plain" }
        }
      },
      "insert report summary"
    );
  }

  if (doc.docType === "ppt") {
    const slide = findAncestorKind(doc.root, chartNode.id, "slide");
    if (!slide) {
      return false;
    }
    const x = Number(chartNode.layout?.x ?? 40);
    const y = Number(chartNode.layout?.y ?? 90);
    const w = Math.max(220, Number(chartNode.layout?.w ?? 430));
    const h = Math.max(90, Math.round(Number(chartNode.layout?.h ?? 200) * 0.35));
    return execute(
      {
        type: "InsertNode",
        parentId: slide.id,
        node: {
          id: prefixedId("text"),
          kind: "text",
          layout: { mode: "absolute", x, y: y + Math.round(Number(chartNode.layout?.h ?? 220)) + 10, w, h, z: 2 },
          props: { text: summary, format: "plain" },
          style: { bg: "#f8fbff", pad: 10, borderW: 1, borderC: "#dbeafe", radius: 8 }
        }
      },
      "insert slide summary"
    );
  }

  return false;
};
