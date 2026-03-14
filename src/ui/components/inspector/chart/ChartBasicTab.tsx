import type { ChartSpec } from "../../../../core/doc/types";
import { chartTypeOptions, formatSourceFieldLabel } from "../../../utils/chart-recommend";

export function ChartBasicTab({
  chartType,
  titleText,
  runtimeAskEnabled,
  labelShow,
  fieldSummary,
  recommendReasonsText,
  previewRowCount,
  summaryText,
  recommendHint,
  summaryHint,
  aiRecommendLoading,
  fields,
  onChangeChartType,
  onChangeTitle,
  onToggleQuickDarkTheme,
  onToggleQuickGrid,
  onToggleLabels,
  onToggleRuntimeAsk,
  onApplySmartTypeRecommend,
  onAutoRecommendBindings,
  onApplyAiRecommend,
  onRollbackRecommend,
  onApplySummaryToSubtitle,
  onInsertSummaryTextBlock
}: {
  chartType: ChartSpec["chartType"];
  titleText?: string;
  runtimeAskEnabled: boolean;
  labelShow: boolean;
  fieldSummary: string;
  recommendReasonsText: string;
  previewRowCount: number;
  summaryText: string;
  recommendHint: string;
  summaryHint: string;
  aiRecommendLoading: boolean;
  fields: Array<{ name: string; label?: string; type?: string }>;
  onChangeChartType: (chartType: ChartSpec["chartType"]) => void;
  onChangeTitle: (value: string) => void;
  onToggleQuickDarkTheme: () => void;
  onToggleQuickGrid: () => void;
  onToggleLabels: () => void;
  onToggleRuntimeAsk: (checked: boolean) => void;
  onApplySmartTypeRecommend: () => void;
  onAutoRecommendBindings: () => void;
  onApplyAiRecommend: () => void;
  onRollbackRecommend: () => void;
  onApplySummaryToSubtitle: () => void;
  onInsertSummaryTextBlock: () => void;
}): JSX.Element {
  return (
    <>
      <label className="col">
        <span>Chart Type</span>
        <select className="select" value={chartType ?? "line"} onChange={(event) => onChangeChartType(event.target.value as ChartSpec["chartType"])}>
          {chartTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="col">
        <span>Title</span>
        <input className="input" value={String(titleText ?? "")} onChange={(event) => onChangeTitle(event.target.value)} />
      </label>
      <div className="col" style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 8 }}>
        <strong>快捷操作</strong>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {(["line", "bar", "pie", "scatter", "combo", "radar"] as ChartSpec["chartType"][]).map((type) => (
            <button
              key={`quick_type_${type}`}
              className={`btn mini-btn ${chartType === type ? "primary" : ""}`}
              title={`快速切换到 ${type}`}
              onClick={() => onChangeChartType(type)}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn mini-btn" title="一键切换暗色主题/恢复默认主题" onClick={onToggleQuickDarkTheme}>
            暗色
          </button>
          <button className="btn mini-btn" title="一键切换网格显示" onClick={onToggleQuickGrid}>
            网格
          </button>
          <button className="btn mini-btn" title="一键切换数据标签显示" onClick={onToggleLabels}>
            {labelShow ? "关标签" : "开标签"}
          </button>
        </div>
        <label className="row">
          <input type="checkbox" checked={runtimeAskEnabled} onChange={(event) => onToggleRuntimeAsk(event.target.checked)} />
          <span>运行态显示智能追问入口（头部图标）</span>
        </label>
      </div>
      <div className="row">
        <button className="btn primary" onClick={onApplySmartTypeRecommend}>
          智能类型推荐
        </button>
        <button className="btn" onClick={onAutoRecommendBindings}>
          自动字段推荐
        </button>
        <button className="btn" disabled={aiRecommendLoading} onClick={onApplyAiRecommend}>
          {aiRecommendLoading ? "AI 推荐中..." : "AI 推荐"}
        </button>
        {recommendHint ? (
          <button className="btn" onClick={onRollbackRecommend}>
            一键回退推荐
          </button>
        ) : null}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        字段识别: {fieldSummary || fields.slice(0, 4).map((field) => `${formatSourceFieldLabel(field)}:${field.type}`).join(", ") || "无字段"}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        推荐解释: {recommendReasonsText}
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>自动总结</strong>
          <span className="muted">样本 {previewRowCount} 行</span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {summaryText}
        </div>
        <div className="row">
          <button className="btn" onClick={onApplySummaryToSubtitle}>
            写入副标题
          </button>
          <button className="btn" onClick={onInsertSummaryTextBlock}>
            插入总结文本块
          </button>
        </div>
        {summaryHint ? <div className="muted">{summaryHint}</div> : null}
      </div>
    </>
  );
}
