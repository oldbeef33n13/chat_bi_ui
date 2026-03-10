import { useEffect, useRef, useState } from "react";
import type { TableSpec, VDoc, VNode } from "../../../core/doc/types";
import type { DataEndpointMeta } from "../../api/data-endpoint-repository";
import { HttpDataEndpointRepository } from "../../api/http-data-endpoint-repository";
import { useEditorStore } from "../../state/editor-context";
import { buildTableRenderModel } from "../../../runtime/table/table-adapter";
import { extractSourceFields } from "../../utils/chart-recommend";
import { resolveDataEndpointParams } from "../../utils/data-endpoint-binding";
import { DataGuideDialog } from "../DataGuideDialog";
import { NodeStyleInspector } from "../NodeStyleInspector";
import { TextStyleEditor } from "../TextStyleEditor";
import {
  ParamBindingEditorDialog,
  describeParamBinding,
  describeResolvedParams,
  extractSourceSampleRows,
  type InspectorTab
} from "./shared";

export function TableInspector({
  doc,
  node,
  activeTab,
  endpoints
}: {
  doc: VDoc;
  node: VNode;
  activeTab: InspectorTab;
  endpoints: DataEndpointMeta[];
}): JSX.Element {
  const store = useEditorStore();
  const endpointRepoRef = useRef(new HttpDataEndpointRepository("/api/v1"));
  const props = (node.props ?? {}) as TableSpec;
  const endpointId = node.data?.endpointId ?? "";
  const endpoint = endpoints.find((item) => item.id === endpointId);
  const sourceId = node.data?.sourceId ?? doc.dataSources?.[0]?.id ?? "";
  const sourceOptions = doc.dataSources ?? [];
  const queryOptions = doc.queries?.filter((query) => query.sourceId === sourceId) ?? [];
  const queryId = node.data?.queryId ?? queryOptions[0]?.queryId ?? "";
  const paramBindings = node.data?.paramBindings ?? {};
  const resolvedParams = endpointId ? resolveDataEndpointParams(doc, node) : {};
  const [endpointTestHint, setEndpointTestHint] = useState("");
  const [endpointTestRows, setEndpointTestRows] = useState<Array<Record<string, unknown>>>([]);
  const [paramEditorOpen, setParamEditorOpen] = useState(false);
  const [dataGuideOpen, setDataGuideOpen] = useState(false);
  const paramSummary = endpoint
    ? endpoint.paramSchema.map((field) => describeParamBinding(doc, field, paramBindings[field.name]))
    : [];
  const source = sourceOptions.find((item) => item.id === sourceId);
  const tableFields = endpoint
    ? endpoint.resultSchema
    : (source?.schemaFields?.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        unit: field.unit ?? null,
        aggAble: field.aggAble
      })) ??
      extractSourceFields(source).map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        unit: field.unit ?? null
      })));
  const guideSampleRows = endpointId ? endpointTestRows : extractSourceSampleRows(source);
  const columns = props.columns ?? [];
  const headerRows = props.headerRows ?? [];
  const mergeCells = props.mergeCells ?? [];
  const pivot = props.pivot ?? {
    enabled: false,
    rowFields: [],
    columnField: "",
    valueField: "",
    agg: "sum" as const,
    fill: 0,
    valueTitle: "汇总值"
  };
  const inferredHeaderColumnCount = Math.max(
    0,
    ...headerRows.map((row) => row.reduce((sum, cell) => sum + Math.max(1, Number(cell.colSpan ?? 1)), 0))
  );
  const previewColumns =
    columns.length > 0
      ? columns
      : Array.from({ length: inferredHeaderColumnCount }, (_, index) => ({
          key: `h_${index + 1}`,
          title: `列${index + 1}`,
          align: "center" as const
        }));
  const headerPreviewRows =
    headerRows.length > 0 && previewColumns.length > 0
      ? buildTableRenderModel({ columns: previewColumns, headerRows }, []).headerRows
      : [];

  useEffect(() => {
    setParamEditorOpen(false);
    setDataGuideOpen(false);
    setEndpointTestRows([]);
  }, [node.id]);

  const updateProps = (partial: Partial<TableSpec>, summary: string, mergeWindowMs = 0): void => {
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

  const setEndpoint = (nextEndpointId: string): void => {
    const fallbackSource = sourceOptions[0];
    const fallbackQueryId = fallbackSource ? doc.queries?.find((query) => query.sourceId === fallbackSource.id)?.queryId : undefined;
    const nextEndpoint = endpoints.find((item) => item.id === nextEndpointId);
    const nextParamBindings =
      nextEndpoint?.paramSchema.reduce<Record<string, { from: "const"; value?: unknown }>>((result, field) => {
        result[field.name] = { from: "const", value: field.defaultValue ?? "" };
        return result;
      }, {}) ?? {};
    updateData(
      {
        endpointId: nextEndpointId || undefined,
        sourceId: nextEndpoint ? undefined : fallbackSource?.id,
        queryId: nextEndpoint ? undefined : fallbackQueryId,
        params: {},
        paramBindings: Object.keys(nextParamBindings).length > 0 ? nextParamBindings : undefined
      },
      "table endpoint change"
    );
    setEndpointTestHint("");
    setEndpointTestRows([]);
  };

  const updateParamBinding = (
    paramName: string,
    patch: Partial<NonNullable<typeof paramBindings[string]>>
  ): void => {
    updateData(
      {
        paramBindings: {
          ...paramBindings,
          [paramName]: {
            from: "const",
            ...(paramBindings[paramName] ?? {}),
            ...patch
          }
        }
      },
      "table param binding change"
    );
  };

  const runEndpointTest = async (): Promise<void> => {
    if (!endpointId) {
      return;
    }
    try {
      const result = await endpointRepoRef.current.testEndpoint(endpointId, resolvedParams);
      setEndpointTestRows(result.rows);
      setEndpointTestHint(`测试成功，返回 ${result.rows.length} 行`);
    } catch (error) {
      setEndpointTestRows([]);
      setEndpointTestHint(`测试失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateColumn = (index: number, patch: Partial<NonNullable<TableSpec["columns"]>[number]>): void => {
    const next = [...columns];
    const current = next[index] ?? { key: `col_${index + 1}` };
    next[index] = { ...current, ...patch };
    updateProps({ columns: next }, "table update column", 120);
  };

  const removeColumn = (index: number): void => {
    updateProps({ columns: columns.filter((_, idx) => idx !== index) }, "table remove column");
  };

  const addColumn = (): void => {
    const next = [...columns, { key: `col_${columns.length + 1}`, title: `列${columns.length + 1}`, align: "left" as const }];
    updateProps({ columns: next }, "table add column");
  };

  const updateHeaderCell = (
    rowIndex: number,
    cellIndex: number,
    patch: Partial<NonNullable<NonNullable<TableSpec["headerRows"]>[number][number]>>
  ): void => {
    const next = headerRows.map((row, idx) => {
      if (idx !== rowIndex) {
        return row;
      }
      return row.map((cell, cidx) => (cidx === cellIndex ? { ...cell, ...patch } : cell));
    });
    updateProps({ headerRows: next }, "table update header cell", 120);
  };

  const addHeaderRow = (): void => {
    const next = [...headerRows, [{ text: `表头${headerRows.length + 1}`, colSpan: 1, rowSpan: 1, align: "center" as const }]];
    updateProps({ headerRows: next }, "table add header row");
  };

  const buildHeaderFromColumns = (): void => {
    if (columns.length === 0) {
      return;
    }
    const next = [
      columns.map((column) => ({
        text: column.title ?? column.key,
        colSpan: 1,
        rowSpan: 1,
        align: "center" as const
      }))
    ];
    updateProps({ headerRows: next }, "table build header from columns");
  };

  const removeHeaderRow = (rowIndex: number): void => {
    updateProps({ headerRows: headerRows.filter((_, idx) => idx !== rowIndex) }, "table remove header row");
  };

  const addHeaderCell = (rowIndex: number): void => {
    const next = headerRows.map((row, idx) =>
      idx === rowIndex ? [...row, { text: `单元格${row.length + 1}`, colSpan: 1, rowSpan: 1, align: "center" as const }] : row
    );
    updateProps({ headerRows: next }, "table add header cell");
  };

  const removeHeaderCell = (rowIndex: number, cellIndex: number): void => {
    const next = headerRows.map((row, idx) => (idx === rowIndex ? row.filter((_, cidx) => cidx !== cellIndex) : row));
    updateProps({ headerRows: next }, "table remove header cell");
  };

  const adjustHeaderSpan = (rowIndex: number, cellIndex: number, key: "colSpan" | "rowSpan", delta: number): void => {
    const cell = headerRows[rowIndex]?.[cellIndex];
    if (!cell) {
      return;
    }
    const current = Math.max(1, Number(cell[key] ?? 1));
    updateHeaderCell(rowIndex, cellIndex, { [key]: Math.max(1, current + delta) });
  };

  const updateMergeCell = (index: number, patch: Partial<NonNullable<TableSpec["mergeCells"]>[number]>): void => {
    const next = mergeCells.map((cell, idx) => (idx === index ? { ...cell, ...patch } : cell));
    updateProps({ mergeCells: next }, "table update merge cell", 120);
  };

  const addMergeCell = (): void => {
    const next = [...mergeCells, { row: 0, col: 0, rowSpan: 1, colSpan: 1, scope: "header" as const }];
    updateProps({ mergeCells: next }, "table add merge cell");
  };

  const removeMergeCell = (index: number): void => {
    updateProps({ mergeCells: mergeCells.filter((_, idx) => idx !== index) }, "table remove merge cell");
  };

  const updatePivot = (patch: Partial<NonNullable<TableSpec["pivot"]>>): void => {
    updateProps({ pivot: { ...pivot, ...patch } }, "table update pivot", 120);
  };

  return (
    <div className="col">
      {activeTab === "basic" ? (
        <>
          <label className="col">
            <span>表格标题</span>
            <input className="input" value={String(props.titleText ?? "")} onChange={(event) => updateProps({ titleText: event.target.value }, "table title", 140)} />
          </label>
          <label className="col">
            <span>最大行数</span>
            <input
              className="input"
              type="number"
              value={Number(props.maxRows ?? 200)}
              onChange={(event) => updateProps({ maxRows: Math.max(1, Number(event.target.value) || 1) }, "table max rows")}
            />
          </label>
        </>
      ) : null}

      {activeTab === "data" ? (
        <>
          <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>{endpointId ? "动态数据接口" : "数据来源"}</strong>
              {endpoint ? <span className="chip">{endpoint.providerType}</span> : null}
            </div>
            <div className="inspector-stat-summary">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>数据概览</strong>
                <button className="btn mini-btn" onClick={() => setDataGuideOpen(true)} disabled={!endpoint && !source}>
                  查看数据说明
                </button>
              </div>
              <div className="muted">
                {tableFields.length > 0 ? `${tableFields.length} 个字段，可先看字段定义和样例数据，再决定列配置。` : "先选择数据接口或静态数据源。"}
              </div>
            </div>
            <label className="col">
              <span>数据接口</span>
              <select className="select" value={endpointId} onChange={(event) => setEndpoint(event.target.value)} disabled={endpoints.length === 0}>
                <option value="">不使用动态接口</option>
                {endpoints.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.id})
                  </option>
                ))}
              </select>
            </label>
            {endpoint ? (
              <>
                <div className="muted" style={{ fontSize: 12 }}>
                  {endpoint.method} {endpoint.path}
                </div>
                {endpoint.paramSchema.length > 0 ? (
                  <div className="col inspector-param-summary" style={{ marginTop: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <strong>参数映射</strong>
                      <button className="btn mini-btn" onClick={() => setParamEditorOpen(true)}>
                        编辑参数映射
                      </button>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {`共 ${endpoint.paramSchema.length} 个参数。设计器测试默认使用模板默认值 / 系统变量 / 筛选默认值。`}
                    </div>
                    <div className="col" style={{ gap: 4 }}>
                      {paramSummary.map((item) => (
                        <div key={`table_summary_${item}`} className="muted" style={{ fontSize: 12 }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="row">
                  <button className="btn" onClick={() => void runEndpointTest()}>
                    测试取数
                  </button>
                  <button className="btn" onClick={() => setDataGuideOpen(true)}>
                    查看数据定义
                  </button>
                  <button className="btn" onClick={() => setEndpoint("")}>
                    切回静态数据源
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  当前测试值: {describeResolvedParams(endpoint, resolvedParams)}
                </div>
                {endpointTestHint ? <div className="muted">{endpointTestHint}</div> : null}
              </>
            ) : null}
          </div>
          {!endpointId ? (
            <>
              <label className="col">
                <span>静态数据源</span>
                <select className="select" value={sourceId} onChange={(event) => updateData({ sourceId: event.target.value }, "table source change")} disabled={sourceOptions.length === 0}>
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
              <label className="col">
                <span>查询</span>
                <select className="select" value={queryId} onChange={(event) => updateData({ queryId: event.target.value }, "table query change")} disabled={queryOptions.length === 0}>
                  {queryOptions.length > 0 ? (
                    queryOptions.map((item) => (
                      <option key={item.queryId} value={item.queryId}>
                        {item.queryId}
                      </option>
                    ))
                  ) : (
                    <option value="">无查询</option>
                  )}
                </select>
              </label>
            </>
          ) : null}
        </>
      ) : null}

      {activeTab === "style" ? (
        <>
          <div className="row">
            <label className="row">
              <input type="checkbox" checked={props.repeatHeader ?? true} onChange={(event) => updateProps({ repeatHeader: event.target.checked }, "table repeat header")} />
              <span>重复表头（导出）</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={props.zebra ?? true} onChange={(event) => updateProps({ zebra: event.target.checked }, "table zebra")} />
              <span>斑马纹</span>
            </label>
          </div>
          <TextStyleEditor title="表格标题样式" value={props.titleStyle} onChange={(style) => updateProps({ titleStyle: style }, "table title style")} />
          <NodeStyleInspector node={node} title="表格容器样式" showTextControls={false} />
        </>
      ) : null}

      {activeTab === "advanced" ? (
        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <div className="col">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>列定义</strong>
              <button className="btn" onClick={addColumn}>
                +新增列
              </button>
            </div>
            {columns.length === 0 ? <div className="muted">暂无列定义</div> : null}
            {columns.map((column, idx) => (
              <div key={`${column.key}_${idx}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="col" style={{ minWidth: 120 }}>
                  <span>Key</span>
                  <input className="input" value={column.key} onChange={(event) => updateColumn(idx, { key: event.target.value })} />
                </label>
                <label className="col" style={{ minWidth: 120 }}>
                  <span>标题</span>
                  <input className="input" value={String(column.title ?? "")} onChange={(event) => updateColumn(idx, { title: event.target.value })} />
                </label>
                <label className="col" style={{ width: 96 }}>
                  <span>宽度</span>
                  <input
                    className="input"
                    type="number"
                    value={Number(column.width ?? 0)}
                    onChange={(event) => updateColumn(idx, { width: Math.max(0, Number(event.target.value) || 0) || undefined })}
                  />
                </label>
                <label className="col" style={{ width: 108 }}>
                  <span>对齐</span>
                  <select className="select" value={column.align ?? "left"} onChange={(event) => updateColumn(idx, { align: event.target.value as "left" | "center" | "right" })}>
                    <option value="left">left</option>
                    <option value="center">center</option>
                    <option value="right">right</option>
                  </select>
                </label>
                <button className="btn danger" onClick={() => removeColumn(idx)}>
                  删列
                </button>
              </div>
            ))}
          </div>

          <div className="col table-header-designer">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>多级表头设计器</strong>
              <div className="row">
                <button className="btn mini-btn" onClick={buildHeaderFromColumns} disabled={columns.length === 0}>
                  从列生成
                </button>
                <button className="btn mini-btn" onClick={addHeaderRow}>
                  +表头行
                </button>
              </div>
            </div>
            {headerRows.length === 0 ? <div className="muted">暂无多级表头，可先从列定义自动生成。</div> : null}
            {headerRows.map((row, rowIndex) => (
              <div key={`header_row_${rowIndex}`} className="table-header-row-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{`第 ${rowIndex + 1} 行`}</strong>
                  <div className="row">
                    <button className="btn mini-btn" onClick={() => addHeaderCell(rowIndex)}>
                      +单元格
                    </button>
                    <button className="btn mini-btn danger" onClick={() => removeHeaderRow(rowIndex)}>
                      删除行
                    </button>
                  </div>
                </div>
                <div className="table-header-cell-list">
                  {row.map((cell, cellIndex) => (
                    <div key={`header_cell_${rowIndex}_${cellIndex}`} className="table-header-cell-card">
                      <input
                        className="input"
                        value={String(cell.text ?? cell.title ?? "")}
                        onChange={(event) => updateHeaderCell(rowIndex, cellIndex, { text: event.target.value })}
                        placeholder="表头文本"
                      />
                      <div className="row">
                        <span className="muted">列跨</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "colSpan", -1)}>
                          -
                        </button>
                        <span className="chip">{Math.max(1, Number(cell.colSpan ?? 1))}</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "colSpan", 1)}>
                          +
                        </button>
                        <span className="muted">行跨</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "rowSpan", -1)}>
                          -
                        </button>
                        <span className="chip">{Math.max(1, Number(cell.rowSpan ?? 1))}</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "rowSpan", 1)}>
                          +
                        </button>
                      </div>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <select className="select mini-select" value={cell.align ?? "center"} onChange={(event) => updateHeaderCell(rowIndex, cellIndex, { align: event.target.value as "left" | "center" | "right" })}>
                          <option value="left">left</option>
                          <option value="center">center</option>
                          <option value="right">right</option>
                        </select>
                        <button className="btn mini-btn danger" onClick={() => removeHeaderCell(rowIndex, cellIndex)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {headerPreviewRows.length > 0 ? (
              <div className="table-header-preview-wrap">
                <strong>表头实时预览</strong>
                <div className="table-header-preview-scroll">
                  <table className="table-header-preview">
                    <tbody>
                      {headerPreviewRows.map((row, rowIndex) => (
                        <tr key={`preview_row_${rowIndex}`}>
                          {row.map((cell, cellIndex) =>
                            cell.hidden ? null : (
                              <td key={`preview_cell_${rowIndex}_${cellIndex}`} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={{ textAlign: cell.align }}>
                                <span>{cell.text || "-"}</span>
                                <small>{`r${cell.rowSpan} c${cell.colSpan}`}</small>
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  预览按当前列定义与表头配置渲染，用于快速校验合并是否正确。
                </div>
              </div>
            ) : null}
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>精确合并规则（可选）</strong>
              <button className="btn" onClick={addMergeCell}>
                +新增合并
              </button>
            </div>
            {mergeCells.length === 0 ? <div className="muted">暂无合并配置</div> : null}
            {mergeCells.map((cell, idx) => (
              <div key={`merge_${idx}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="col" style={{ width: 72 }}>
                  <span>row</span>
                  <input className="input" type="number" value={Number(cell.row ?? 0)} onChange={(event) => updateMergeCell(idx, { row: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                <label className="col" style={{ width: 72 }}>
                  <span>col</span>
                  <input className="input" type="number" value={Number(cell.col ?? 0)} onChange={(event) => updateMergeCell(idx, { col: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                <label className="col" style={{ width: 92 }}>
                  <span>rowSpan</span>
                  <input
                    className="input"
                    type="number"
                    value={Number(cell.rowSpan ?? 1)}
                    onChange={(event) => updateMergeCell(idx, { rowSpan: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </label>
                <label className="col" style={{ width: 92 }}>
                  <span>colSpan</span>
                  <input
                    className="input"
                    type="number"
                    value={Number(cell.colSpan ?? 1)}
                    onChange={(event) => updateMergeCell(idx, { colSpan: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </label>
                <label className="col" style={{ width: 120 }}>
                  <span>scope</span>
                  <select className="select" value={cell.scope ?? "header"} onChange={(event) => updateMergeCell(idx, { scope: event.target.value as "header" | "body" })}>
                    <option value="header">header</option>
                    <option value="body">body</option>
                  </select>
                </label>
                <button className="btn mini-btn danger" onClick={() => removeMergeCell(idx)}>
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <strong>透视配置</strong>
            <label className="row">
              <input type="checkbox" checked={Boolean(pivot.enabled)} onChange={(event) => updatePivot({ enabled: event.target.checked })} />
              <span>启用 Pivot</span>
            </label>
            <label className="col">
              <span>行字段（逗号分隔）</span>
              <input
                className="input"
                value={pivot.rowFields.join(", ")}
                onChange={(event) =>
                  updatePivot({
                    rowFields: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                  })
                }
              />
            </label>
            <label className="col">
              <span>列字段</span>
              <input className="input" value={pivot.columnField} onChange={(event) => updatePivot({ columnField: event.target.value })} />
            </label>
            <label className="col">
              <span>值字段</span>
              <input className="input" value={pivot.valueField} onChange={(event) => updatePivot({ valueField: event.target.value })} />
            </label>
            <label className="col">
              <span>聚合</span>
              <select className="select" value={pivot.agg ?? "sum"} onChange={(event) => updatePivot({ agg: event.target.value as "sum" | "avg" | "min" | "max" | "count" })}>
                <option value="sum">sum</option>
                <option value="avg">avg</option>
                <option value="min">min</option>
                <option value="max">max</option>
                <option value="count">count</option>
              </select>
            </label>
            <label className="col">
              <span>缺省填充值</span>
              <input className="input" type="number" value={Number(pivot.fill ?? 0)} onChange={(event) => updatePivot({ fill: Number(event.target.value) || 0 })} />
            </label>
            <label className="col">
              <span>值标题</span>
              <input className="input" value={pivot.valueTitle ?? ""} onChange={(event) => updatePivot({ valueTitle: event.target.value })} />
            </label>
          </div>
        </div>
      ) : null}
      <DataGuideDialog
        open={dataGuideOpen}
        title={endpoint?.name ?? source?.id ?? "数据来源"}
        endpoint={endpoint}
        source={endpoint ? undefined : source}
        fields={tableFields}
        sampleRows={guideSampleRows}
        paramSummary={paramSummary}
        onClose={() => setDataGuideOpen(false)}
      />
      <ParamBindingEditorDialog
        open={paramEditorOpen}
        title={endpoint?.name ?? "动态接口"}
        doc={doc}
        endpoint={endpoint}
        paramBindings={paramBindings}
        resolvedParams={resolvedParams}
        onChangeBinding={updateParamBinding}
        onClose={() => setParamEditorOpen(false)}
      />
    </div>
  );
}

