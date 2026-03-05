# 图表/表格 DSL 说明文档（详细规范版）

## 0. 文档定位

- 目标：给开发、测试、后端、AI 提示词工程提供“可执行、可校验、可落地”的图表/表格 DSL 规范。
- 范围：`kind = chart` 与 `kind = table` 节点。
- 版本基线：`schemaVersion = 1.0.0`。

规范来源（强约束）：

- `src/core/doc/types.ts`
- `src/core/doc/schema.ts`
- `src/runtime/chart/chart-adapter.ts`
- `src/runtime/table/table-adapter.ts`
- `tools/poi-dsl-exporter/src/main/java/com/chatbi/exporter/chart/*`
- `tools/poi-dsl-exporter/src/main/java/com/chatbi/exporter/table/*`

---

## 1. 节点外壳（VNode 通用字段）

图表和表格都必须放在 `VNode` 结构中。

```ts
interface VNode<TProps = Record<string, unknown>> {
  id: string;                 // 必填
  kind: string;               // chart / table
  name?: string;
  layout?: VLayout;
  style?: VStyle;
  data?: VDataBinding;
  props?: TProps;
  children?: VNode[];
}
```

### 1.1 通用字段约束表

| 字段 | 类型 | 必填 | 约束/枚举 | 说明 |
|---|---|---:|---|---|
| `id` | `string` | 是 | `minLength=1` | 节点唯一 ID |
| `kind` | `string` | 是 | 推荐固定值 `chart/table` | 节点类型 |
| `layout.mode` | `"flow" \| "grid" \| "absolute"` | 否 | schema 枚举 | 布局模式 |
| `data.sourceId` | `string` | 条件必填 | 当 `data` 存在时必填 | 数据源绑定 |
| `data.queryId` | `string` | 否 | - | 查询定义 ID |
| `data.params` | `Record<string, primitive\|array>` | 否 | - | 查询参数 |
| `props` | `ChartSpec / TableSpec` | 强烈建议必填 | schema 在 `kind` 匹配时按对应子 schema 校验 | 组件语义配置 |

注：

- 运行时为了稳定，`chart/table` 节点应始终提供 `props`，不要依赖隐式默认值。

---

## 2. 图表 DSL（ChartSpec）详细定义

## 2.1 ChartType 枚举

主枚举（`types.ts`）：

```ts
"auto" | "line" | "bar" | "pie" | "combo" | "scatter" | "radar" | "heatmap"
| "kline" | "boxplot" | "sankey" | "graph" | "treemap" | "sunburst"
| "parallel" | "funnel" | "gauge" | "calendar" | "custom"
```

## 2.2 BindingRole 枚举

```ts
"x" | "y" | "y1" | "y2" | "secondary" | "ysecondary" | "series" | "color" | "size" | "label"
| "category" | "value"
| "node" | "linkSource" | "linkTarget" | "linkValue"
| "geo" | "lat" | "lng"
| "tooltip" | "facet"
```

## 2.3 FieldBinding 聚合与辅助枚举

- `agg`：`sum / avg / min / max / count / distinctCount / p50 / p95 / p99`
- `axis`：`primary / secondary / number(>=0)`
- `sort`：`asc / desc`
- `timeGrain`：`minute / hour / day / week / month`
- `unit`：`bytes / bps / ms / pct / count`

## 2.4 ChartSpec 字段级规范

| 字段 | 类型 | 必填 | 默认值/推断 | 约束 | 说明 |
|---|---|---:|---|---|---|
| `chartType` | `ChartType` | 是 | - | schema 枚举 | 图表类型 |
| `titleText` | `string` | 否 | 渲染器可回退节点名/默认标题 | - | 主标题 |
| `subtitleText` | `string` | 否 | 空 | - | 副标题 |
| `bindings` | `FieldBinding[]` | 是 | - | `minItems=1` | 字段绑定主结构 |
| `computedFields` | `{name, expression}[]` | 否 | 空 | name/expression 非空 | 计算字段 |
| `legendShow` | `boolean` | 否 | 运行时默认 `true/按图类型` | - | 图例显示 |
| `legendPos` | `top/right/bottom/left` | 否 | `top` | schema 枚举 | 图例位置 |
| `tooltipShow` | `boolean` | 否 | `true` | - | 提示框开关 |
| `gridShow` | `boolean` | 否 | `false` | - | 网格显示 |
| `xAxisShow` | `boolean` | 否 | `true` | - | X 轴显示 |
| `xAxisTitle` | `string` | 否 | 可由绑定推断 | - | X 轴标题 |
| `xAxisType` | `category/value/time/log` | 否 | `category` | schema 枚举 | X 轴类型 |
| `yAxisShow` | `boolean` | 否 | `true` | - | Y 轴显示 |
| `yAxisTitle` | `string` | 否 | 可由绑定推断 | - | Y 轴标题 |
| `yAxisType` | `value/log` | 否 | `value` | schema 枚举 | Y 轴类型 |
| `themeRef` | `string` | 否 | 继承文档主题 | - | 图表主题引用 |
| `paletteRef` | `string` | 否 | 按 theme 推断 | - | 调色板引用 |
| `smooth` | `boolean` | 否 | `false` | - | 折线平滑 |
| `stack` | `boolean` | 否 | `false` | - | 堆叠开关 |
| `area` | `boolean` | 否 | `false` | - | 面积图开关 |
| `labelShow` | `boolean` | 否 | `false` | - | 标签显示 |
| `valueFormat` | `string` | 否 | 空 | - | 数值格式 |
| `timeFormat` | `string` | 否 | 空 | - | 时间格式 |
| `actions` | `ChartAction[]` | 否 | 空 | - | 交互动作 |
| `optionPatch` | `Record<string, unknown>` | 否 | 空对象 | 任意对象 | 专家兜底 patch |

## 2.5 ChartAction 规范

| 字段 | 类型 | 必填 | 枚举/约束 | 说明 |
|---|---|---:|---|---|
| `on` | `"click" \| "hover"` | 是 | schema 枚举 | 触发时机 |
| `type` | `"filter" \| "drill" \| "highlight" \| "call" \| "navigate"` | 是 | schema 枚举 | 行为类型 |
| `targetFilterId` | `string` | 否 | - | 目标过滤器 |
| `map` | `{ fromRole, toParam }` | 否 | fromRole 需在 BindingRole | 参数映射 |
| `fnName` | `string` | 否 | - | 函数回调名 |
| `payload` | `Record<string, unknown>` | 否 | - | 扩展载荷 |
| `url` | `string` | 否 | - | 跳转链接 |

---

## 3. 图表运行与导出兼容矩阵（当前实现）

| 图表类型 | 前端运行时 | POI 导出端 | 说明 |
|---|---|---|---|
| `line` | 原生 | 原生 | 推荐基础类型 |
| `bar` | 原生 | 原生 | 推荐基础类型 |
| `pie` | 原生 | 原生 | 推荐基础类型 |
| `scatter` | 原生 | 原生（已修复单/多序列） | 推荐基础类型 |
| `radar` | 原生 | 原生（含网格补强） | 推荐基础类型 |
| `combo` | 原生（扩展） | 原生（扩展） | 当前是兼容扩展值 |
| `sankey` | 原生 | 降级/兼容策略 | 数据结构建议 `linkSource/Target/Value` |
| `treemap` | 原生 | 降级/兼容策略 | 分类聚合建议 |
| `gauge` | 原生 | 映射渲染 | 通常使用单值绑定 |
| `calendar` | 原生 | 映射渲染 | 日期需可归一化 |
| 其他复杂类型 | 智能降级 | 智能降级 | 需按业务逐步增强 |

---

## 4. 图表典型实例

## 4.1 折线图（最小可用）

```json
{
  "kind": "chart",
  "data": { "sourceId": "ds_alarm", "queryId": "q_alarm" },
  "props": {
    "chartType": "line",
    "titleText": "告警趋势",
    "bindings": [
      { "role": "x", "field": "day", "timeGrain": "day" },
      { "role": "y", "field": "alarm_count", "agg": "sum", "unit": "count" }
    ],
    "smooth": true,
    "legendShow": false,
    "tooltipShow": true
  }
}
```

## 4.2 组合图（扩展值 combo）

```json
{
  "kind": "chart",
  "data": { "sourceId": "ds_finance_week", "queryId": "q_finance_week" },
  "props": {
    "chartType": "combo",
    "titleText": "收入与毛利率周趋势",
    "bindings": [
      { "role": "x", "field": "week" },
      { "role": "y", "field": "revenue_m", "agg": "sum" },
      { "role": "y2", "field": "gross_margin_pct", "agg": "avg" }
    ],
    "legendShow": true,
    "optionPatch": {
      "series": [{ "type": "bar" }, { "type": "line" }],
      "yAxis": [{ "name": "Revenue" }, { "name": "Margin%" }]
    }
  }
}
```

## 4.3 桑基图（关系流）

```json
{
  "kind": "chart",
  "data": { "sourceId": "ds_issue_flow", "queryId": "q_issue_flow" },
  "props": {
    "chartType": "sankey",
    "titleText": "风险到客户影响路径",
    "bindings": [
      { "role": "linkSource", "field": "source" },
      { "role": "linkTarget", "field": "target" },
      { "role": "linkValue", "field": "value", "agg": "sum" }
    ]
  }
}
```

---

## 5. 表格 DSL（TableSpec）详细定义

## 5.1 TableSpec 字段级规范

| 字段 | 类型 | 必填 | 默认值/推断 | 约束 | 说明 |
|---|---|---:|---|---|---|
| `titleText` | `string` | 否 | 空 | - | 表标题 |
| `columns` | `TableColumnSpec[]` | 否 | 可从 rows 推断 | `key` 必填 | 列定义 |
| `headerRows` | `TableHeaderCellSpec[][]` | 否 | 默认单行表头 | - | 多级表头 |
| `mergeCells` | `TableMergeSpec[]` | 否 | 空 | row/col >= 0 | 合并配置 |
| `rows` | `Array<object \| array>` | 否 | 来自数据源 | - | 内联数据 |
| `repeatHeader` | `boolean` | 否 | `true` | - | 跨页重复表头 |
| `zebra` | `boolean` | 否 | `true` | - | 斑马纹 |
| `maxRows` | `number` | 否 | `200` | `>=1` | 最大导出行数 |
| `pivot` | `TablePivotSpec` | 否 | 关闭 | 见下表 | 透视配置 |

## 5.2 TableColumnSpec

| 字段 | 类型 | 必填 | 默认值 | 约束 |
|---|---|---:|---|---|
| `key` | `string` | 是 | - | 非空 |
| `title` | `string` | 否 | `key` | - |
| `width` | `number` | 否 | `120` | `>0` |
| `align` | `"left" \| "center" \| "right"` | 否 | `left` | schema 枚举 |
| `format` | `string` | 否 | 空 | 当前常用：`int/pct` |

## 5.3 TableHeaderCellSpec

| 字段 | 类型 | 必填 | 默认值 | 约束 |
|---|---|---:|---|---|
| `text` | `string` | 否 | 空 | - |
| `title` | `string` | 否 | 空 | `text` 的同义字段 |
| `colSpan` | `number` | 否 | `1` | `>=1` |
| `rowSpan` | `number` | 否 | `1` | `>=1` |
| `align` | `"left" \| "center" \| "right"` | 否 | `center` | schema 枚举 |

## 5.4 TableMergeSpec

| 字段 | 类型 | 必填 | 默认值 | 约束 |
|---|---|---:|---|---|
| `row` | `number` | 是 | - | `>=0` |
| `col` | `number` | 是 | - | `>=0` |
| `rowSpan` | `number` | 否 | `1` | `>=1` |
| `colSpan` | `number` | 否 | `1` | `>=1` |
| `scope` | `"header" \| "body"` | 否 | `body` | schema 枚举 |

## 5.5 TablePivotSpec

| 字段 | 类型 | 必填 | 默认值 | 约束 |
|---|---|---:|---|---|
| `enabled` | `boolean` | 否 | `true` | - |
| `rowFields` | `string[]` | 是 | - | 每项非空 |
| `columnField` | `string` | 是 | - | 非空 |
| `valueField` | `string` | 是 | - | 非空 |
| `agg` | `"sum" \| "avg" \| "min" \| "max" \| "count"` | 否 | `sum` | schema 枚举 |
| `fill` | `number` | 否 | `0` | - |
| `valueTitle` | `string` | 否 | `valueField` | - |

---

## 6. 表格典型实例

## 6.1 多级表头 + 数据区合并

```json
{
  "kind": "table",
  "data": { "sourceId": "ds_capacity", "queryId": "q_capacity" },
  "props": {
    "titleText": "区域容量明细",
    "repeatHeader": true,
    "zebra": true,
    "columns": [
      { "key": "region", "title": "区域", "width": 140, "align": "left" },
      { "key": "month", "title": "月份", "width": 140, "align": "left" },
      { "key": "capacity_tb", "title": "容量(TB)", "width": 120, "align": "right", "format": "int" },
      { "key": "util_pct", "title": "利用率", "width": 120, "align": "right", "format": "pct" },
      { "key": "err_qps", "title": "错误QPS", "width": 120, "align": "right", "format": "int" }
    ],
    "headerRows": [
      [
        { "text": "区域信息", "colSpan": 2, "rowSpan": 1, "align": "center" },
        { "text": "容量与质量", "colSpan": 3, "rowSpan": 1, "align": "center" }
      ],
      [
        { "text": "区域" },
        { "text": "月份" },
        { "text": "容量(TB)" },
        { "text": "利用率" },
        { "text": "错误QPS" }
      ]
    ],
    "mergeCells": [
      { "scope": "body", "row": 0, "col": 0, "rowSpan": 3, "colSpan": 1 },
      { "scope": "body", "row": 3, "col": 0, "rowSpan": 3, "colSpan": 1 }
    ]
  }
}
```

## 6.2 Pivot 透视表

```json
{
  "kind": "table",
  "data": { "sourceId": "ds_pivot", "queryId": "q_pivot" },
  "props": {
    "titleText": "区域x月份错误QPS透视",
    "repeatHeader": true,
    "zebra": true,
    "columns": [{ "key": "region", "title": "区域", "width": 180, "align": "left" }],
    "pivot": {
      "enabled": true,
      "rowFields": ["region"],
      "columnField": "month",
      "valueField": "err_qps",
      "agg": "sum",
      "fill": 0,
      "valueTitle": "错误QPS"
    }
  }
}
```

---

## 7. 校验与落地注意事项

1. `ChartSpec` 与 `TableSpec` 在 schema 中是 `additionalProperties: false`，字段名应严格按规范。
2. `chartType=auto` 依赖绑定自动推断，正式生产建议在保存前固化为具体图表类型。
3. 双轴场景建议使用 `role=y2` 或 `axis=secondary`，避免语义歧义。
4. `table.rows` 与 `data.sourceId/queryId` 可以并存；实现上通常以内联 `rows` 优先。
5. `mergeCells` 行列索引基于逻辑网格（从 0 开始），需与 `headerRows/bodyRows` 对齐。
6. `pivot` 生成动态列后，`columns` 会被重组，建议在展示层读取渲染模型而非原始 `columns`。
