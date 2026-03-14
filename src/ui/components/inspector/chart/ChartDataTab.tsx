import type { ChartSpec, FieldBinding } from "../../../../core/doc/types";
import type { DataEndpointMeta } from "../../../api/data-endpoint-repository";
import { describeStatNarrative } from "../shared";

export function ChartDataTab({
  propsChartType,
  endpointId,
  endpoint,
  endpoints,
  sourceId,
  sourceOptions,
  fields,
  recommend,
  recommendationCards,
  xBinding,
  primaryY,
  secondY,
  xBindings,
  xAxisEntries,
  seriesBindings,
  fieldOptions,
  numericFields,
  computedFields,
  xAxisAdvancedOpen,
  advancedMappingOpen,
  shouldSuggestMultiXAxis,
  paramSummary,
  endpointTesting,
  endpointTestError,
  endpointTestRows,
  resolvedParamsText,
  measureXAxisSummary,
  renderFieldOptionLabel,
  onOpenDataGuide,
  onOpenParamEditor,
  onSelectEndpoint,
  onRunEndpointTest,
  onResetEndpoint,
  onSelectSource,
  onAutoRecommendBindings,
  onApplyDisplayRecommendation,
  onSetPrimaryXField,
  onSetPrimaryYField,
  onOpenAggEditor,
  onToggleAdvancedMapping,
  onToggleSecondAxis,
  onAutoMatchXAxis,
  onToggleXAxisAdvanced,
  onAddSeriesBinding,
  onSetSecondAxisField,
  onAddXAxisBinding,
  onUpdateXAxisBinding,
  onRemoveXAxisBinding,
  onSetPrimaryYXAxis,
  onSetSecondAxisX,
  onUpdateSeriesBinding,
  onRemoveSeriesBinding,
  onAddComputedField,
  onUpdateComputedField,
  onRemoveComputedField
}: {
  propsChartType: ChartSpec["chartType"];
  endpointId: string;
  endpoint?: DataEndpointMeta;
  endpoints: DataEndpointMeta[];
  sourceId: string;
  sourceOptions: Array<{ id: string }>;
  fields: Array<{ name: string; label?: string; type?: string; unit?: string | null; aggAble?: boolean }>;
  recommend: { chartType: ChartSpec["chartType"]; reasons: string[] };
  recommendationCards: Array<{ id: string; label: string; chartType: ChartSpec["chartType"]; description: string }>;
  xBinding?: FieldBinding;
  primaryY?: FieldBinding;
  secondY?: FieldBinding;
  xBindings: FieldBinding[];
  xAxisEntries: Array<{ binding: FieldBinding; axisIndex: number }>;
  seriesBindings: FieldBinding[];
  fieldOptions: string[];
  numericFields: string[];
  computedFields: Array<{ name: string; expression: string }>;
  xAxisAdvancedOpen: boolean;
  advancedMappingOpen: boolean;
  shouldSuggestMultiXAxis: boolean;
  paramSummary: string[];
  endpointTesting: boolean;
  endpointTestError: string;
  endpointTestRows: Array<Record<string, unknown>>;
  resolvedParamsText: string;
  measureXAxisSummary: string;
  renderFieldOptionLabel: (fieldName: string) => string;
  onOpenDataGuide: () => void;
  onOpenParamEditor: () => void;
  onSelectEndpoint: (id: string) => void;
  onRunEndpointTest: () => void;
  onResetEndpoint: () => void;
  onSelectSource: (id: string) => void;
  onAutoRecommendBindings: () => void;
  onApplyDisplayRecommendation: (chartType: ChartSpec["chartType"], label: string) => void;
  onSetPrimaryXField: (field: string) => void;
  onSetPrimaryYField: (field: string) => void;
  onOpenAggEditor: () => void;
  onToggleAdvancedMapping: () => void;
  onToggleSecondAxis: (enabled: boolean) => void;
  onAutoMatchXAxis: () => void;
  onToggleXAxisAdvanced: () => void;
  onAddSeriesBinding: () => void;
  onSetSecondAxisField: (field: string) => void;
  onAddXAxisBinding: () => void;
  onUpdateXAxisBinding: (index: number, patch: Partial<FieldBinding>) => void;
  onRemoveXAxisBinding: (index: number) => void;
  onSetPrimaryYXAxis: (axisIndex: number) => void;
  onSetSecondAxisX: (axisIndex: number) => void;
  onUpdateSeriesBinding: (index: number, patch: Partial<FieldBinding>) => void;
  onRemoveSeriesBinding: (index: number) => void;
  onAddComputedField: () => void;
  onUpdateComputedField: (index: number, patch: Partial<{ name: string; expression: string }>) => void;
  onRemoveComputedField: (index: number) => void;
}): JSX.Element {
  return (
    <>
      <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>{endpointId ? "动态数据接口" : "数据来源"}</strong>
          {endpoint ? <span className="chip">{endpoint.providerType}</span> : null}
        </div>
        <div className="inspector-stat-summary">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>数据概览</strong>
            <button className="btn mini-btn" onClick={onOpenDataGuide} disabled={!endpoint && sourceOptions.length === 0}>
              查看数据说明
            </button>
          </div>
          <div className="muted">
            {fields.length > 0
              ? `${fields.length} 个字段，推荐 ${recommend.chartType}。${recommend.reasons.join("；")}`
              : "先选择数据接口或静态数据源，再查看字段与样例数据。"}
          </div>
        </div>
        <label className="col">
          <span>数据接口</span>
          <select className="select" value={endpointId} onChange={(event) => onSelectEndpoint(event.target.value)} disabled={endpoints.length === 0}>
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
                  <button className="btn mini-btn" onClick={onOpenParamEditor}>
                    编辑参数映射
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {`共 ${endpoint.paramSchema.length} 个参数。设计器测试默认使用模板默认值 / 系统变量 / 筛选默认值。`}
                </div>
                <div className="col" style={{ gap: 4 }}>
                  {paramSummary.map((item) => (
                    <div key={`summary_${item}`} className="muted" style={{ fontSize: 12 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                当前接口无参数，可直接测试取数。
              </div>
            )}
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn" onClick={onRunEndpointTest} disabled={endpointTesting}>
                {endpointTesting ? "测试中..." : "测试取数"}
              </button>
              <button className="btn" onClick={onOpenDataGuide}>
                查看数据定义
              </button>
              <button className="btn" onClick={onResetEndpoint}>
                切回静态数据源
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              当前测试值: {resolvedParamsText}
            </div>
            {endpointTestError ? <div className="chip" style={{ color: "#b91c1c" }}>{endpointTestError}</div> : null}
            {endpointTestRows.length > 0 ? (
              <div className="muted" style={{ fontSize: 12 }}>
                测试返回 {endpointTestRows.length} 行，字段: {fields.slice(0, 6).map((field) => renderFieldOptionLabel(field.name)).join(", ") || "无"}
              </div>
            ) : null}
          </>
        ) : (
          <div className="muted" style={{ fontSize: 12 }}>
            未绑定动态接口时，下面仍可使用静态 source/query。
          </div>
        )}
      </div>
      {!endpointId ? (
        <label className="col">
          <span>静态数据源</span>
          <select className="select" value={sourceId} onChange={(event) => onSelectSource(event.target.value)} disabled={sourceOptions.length === 0}>
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
      ) : null}

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>推荐展示方式</strong>
          <span className="muted">{`当前图表：${propsChartType ?? "line"}`}</span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          先选择你想表达的分析意图，系统会自动给出更合适的图表类型和默认字段绑定。
        </div>
        <div className="col" style={{ gap: 8 }}>
          {recommendationCards.length > 0 ? (
            recommendationCards.map((item) => (
              <button
                key={item.id}
                className={`btn ${propsChartType === item.chartType ? "primary" : ""}`}
                onClick={() => onApplyDisplayRecommendation(item.chartType, item.description)}
                style={{ justifyContent: "space-between" }}
              >
                <span>{item.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {item.description}
                </span>
              </button>
            ))
          ) : (
            <div className="muted">当前字段还不足以给出清晰的推荐展示方式，请先选择数据接口或补充字段。</div>
          )}
        </div>
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>基础字段绑定</strong>
          <button className="btn mini-btn" onClick={onAutoRecommendBindings} disabled={fieldOptions.length === 0}>
            自动匹配
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          先确认“按什么维度看、看哪个指标”，这是大多数图表最常用的配置。
        </div>
        <label className="col">
          <span>分析维度</span>
          <select className="select" value={xBinding?.field ?? ""} onChange={(event) => onSetPrimaryXField(event.target.value)}>
            <option value="">请选择</option>
            {fieldOptions.map((field) => (
              <option key={field} value={field}>
                {renderFieldOptionLabel(field)}
              </option>
            ))}
          </select>
        </label>
        <label className="col">
          <span>统计指标</span>
          <select className="select" value={primaryY?.field ?? ""} onChange={(event) => onSetPrimaryYField(event.target.value)}>
            <option value="">请选择</option>
            {(numericFields.length > 0 ? numericFields : fieldOptions).map((field) => (
              <option key={field} value={field}>
                {renderFieldOptionLabel(field)}
              </option>
            ))}
          </select>
        </label>
        <div className="inspector-stat-summary">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>统计口径</strong>
            <button className="btn mini-btn" onClick={onOpenAggEditor} disabled={!primaryY}>
              编辑统计口径
            </button>
          </div>
          <div className="muted">{describeStatNarrative(fields, primaryY, xBinding, seriesBindings)}</div>
          {secondY ? <div className="muted">{describeStatNarrative(fields, secondY, xBinding, seriesBindings)}</div> : null}
          <div className="muted">系统会自动推荐统计口径：数量/流量通常求和，比例/时延通常取平均。</div>
        </div>
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>高级映射</strong>
          <button className="btn mini-btn" onClick={onToggleAdvancedMapping}>
            {advancedMappingOpen ? "收起" : "展开"}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          第二轴、多 X 轴、多系列和计算字段会影响更复杂的分析表达，只有需要时再展开。
        </div>
        <label className="row">
          <input type="checkbox" checked={Boolean(secondY)} onChange={(event) => onToggleSecondAxis(event.target.checked)} />
          <span>添加第二轴</span>
        </label>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div className="row">
            {xBindings.length > 1 ? <span className="chip-warning">已启用多 X 轴</span> : <span className="muted">默认单 X 轴，适合大多数场景</span>}
            {shouldSuggestMultiXAxis && xBindings.length <= 1 ? <span className="chip">建议启用多 X 轴</span> : null}
          </div>
          <div className="row">
            <button className="btn mini-btn" onClick={onAutoMatchXAxis} disabled={fieldOptions.length === 0}>
              一键自动匹配 X 轴
            </button>
            <button className="btn mini-btn" onClick={onToggleXAxisAdvanced}>
              {xAxisAdvancedOpen ? "收起高级X轴" : "显示高级X轴"}
            </button>
          </div>
        </div>
        <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>系列维度（可多个）</strong>
            <button className="btn mini-btn" onClick={onAddSeriesBinding} disabled={fieldOptions.length === 0}>
              +系列
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {seriesBindings.length === 0 ? "未配置系列维度，当前仅单系列渲染。" : `已配置 ${seriesBindings.length} 个系列维度。`}
          </div>
        </div>
        {advancedMappingOpen ? (
          <>
            {secondY ? (
              <label className="col">
                <span>第二指标（第二轴）</span>
                <select className="select" value={secondY.field} onChange={(event) => onSetSecondAxisField(event.target.value)}>
                  {numericFields.map((field) => (
                    <option key={field} value={field}>
                      {renderFieldOptionLabel(field)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {xAxisAdvancedOpen ? (
              <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>多 X 轴配置（高级）</strong>
                  <button className="btn mini-btn" onClick={onAddXAxisBinding} disabled={fieldOptions.length === 0}>
                    +X 轴
                  </button>
                </div>
                {xBindings.length === 0 ? <div className="muted">未配置 X 轴字段。</div> : null}
                {xBindings.map((binding, index) => (
                  <div key={`x_binding_${index}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="col" style={{ minWidth: 150 }}>
                      <span>{`X 轴字段 #${index + 1}`}</span>
                      <select className="select" value={binding.field} onChange={(event) => onUpdateXAxisBinding(index, { field: event.target.value })}>
                        {fieldOptions.map((field) => (
                          <option key={field} value={field}>
                            {renderFieldOptionLabel(field)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col" style={{ width: 96 }}>
                      <span>轴序号</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={typeof binding.axis === "number" ? Math.max(0, Math.floor(binding.axis)) : index}
                        onChange={(event) => onUpdateXAxisBinding(index, { axis: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </label>
                    <button className="btn mini-btn danger" onClick={() => onRemoveXAxisBinding(index)}>
                      删除
                    </button>
                  </div>
                ))}
                <label className="col">
                  <span>主指标绑定 X 轴</span>
                  <select className="select" value={Number(primaryY?.xAxis ?? 0)} onChange={(event) => onSetPrimaryYXAxis(Number(event.target.value) || 0)} disabled={xAxisEntries.length === 0}>
                    {xAxisEntries.map((entry, index) => (
                      <option key={`x_axis_map_${index}`} value={entry.axisIndex}>
                        {`xAxis[${entry.axisIndex}] · ${entry.binding.as ?? entry.binding.field}`}
                      </option>
                    ))}
                  </select>
                </label>
                {secondY ? (
                  <label className="col">
                    <span>第二轴指标绑定 X 轴</span>
                    <select className="select" value={Number(secondY.xAxis ?? 0)} onChange={(event) => onSetSecondAxisX(Number(event.target.value) || 0)} disabled={xAxisEntries.length === 0}>
                      {xAxisEntries.map((entry, index) => (
                        <option key={`x_axis_map_second_${index}`} value={entry.axisIndex}>
                          {`xAxis[${entry.axisIndex}] · ${entry.binding.as ?? entry.binding.field}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="muted" style={{ fontSize: 12 }}>
                  当前映射：{measureXAxisSummary}
                </div>
              </div>
            ) : null}
            <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
              {seriesBindings.length === 0 ? <div className="muted">未配置系列维度，当前仅单系列渲染。</div> : null}
              {seriesBindings.map((binding, index) => (
                <div key={`${binding.role}_${binding.field}_${index}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="col" style={{ minWidth: 120 }}>
                    <span>角色</span>
                    <select className="select" value={binding.role} onChange={(event) => onUpdateSeriesBinding(index, { role: event.target.value as FieldBinding["role"] })}>
                      <option value="series">series</option>
                      <option value="color">color</option>
                      <option value="facet">facet</option>
                    </select>
                  </label>
                  <label className="col" style={{ minWidth: 140 }}>
                    <span>字段</span>
                    <select className="select" value={binding.field} onChange={(event) => onUpdateSeriesBinding(index, { field: event.target.value })}>
                      {fieldOptions.map((field) => (
                        <option key={field} value={field}>
                          {renderFieldOptionLabel(field)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn mini-btn danger" onClick={() => onRemoveSeriesBinding(index)}>
                    删除
                  </button>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 12 }}>
                支持多维拆分，渲染时按“维度1 / 维度2”组合系列，适用于多业务线、多地域等场景。
              </div>
            </div>
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>计算字段</strong>
                <button className="btn" onClick={onAddComputedField}>
                  +计算字段
                </button>
              </div>
              {computedFields.length === 0 ? <div className="muted">暂无计算字段</div> : null}
              {computedFields.map((field, idx) => (
                <div key={`${field.name}_${idx}`} className="row">
                  <input className="input" placeholder="字段名" value={field.name} onChange={(event) => onUpdateComputedField(idx, { name: event.target.value })} />
                  <input className="input" placeholder="表达式，例如: bytes / 1024" value={field.expression} onChange={(event) => onUpdateComputedField(idx, { expression: event.target.value })} />
                  <button className="btn danger" onClick={() => onRemoveComputedField(idx)}>
                    删除
                  </button>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 12 }}>
                表达式支持数字运算和字段名引用，例如 `in_bps / out_bps`。
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
