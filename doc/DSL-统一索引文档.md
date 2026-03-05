# 统一 DSL 索引文档

## 1. 文档目标

本文档是 DSL 规范总入口，用于：

1. 快速定位各子域规范（图表/表格、PPT、DOC）。
2. 提供统一对象模型与枚举索引，避免口径不一致。
3. 给需求、开发、测试、AI 提示词工程提供同一份对照基准。

版本基线：`schemaVersion = 1.0.0`  
适用范围：`dashboard / report / ppt` 编辑与导出链路

---

## 2. 规范入口

1. 图表/表格规范：`doc/DSL-图表与表格说明.md`
2. PPT 规范：`doc/DSL-PPT说明文档.md`
3. DOC 规范：`doc/DSL-DOC说明文档.md`

代码基准文件：

1. `src/core/doc/types.ts`
2. `src/core/doc/schema.ts`
3. `src/runtime/chart/chart-adapter.ts`
4. `src/runtime/table/table-adapter.ts`
5. `tools/poi-dsl-exporter/src/main/java/com/chatbi/exporter/*`

---

## 3. 统一对象模型（跨文档共用）

## 3.1 VDoc（顶层）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `docId` | `string` | 是 | 文档唯一标识 |
| `docType` | `"chart" \| "dashboard" \| "report" \| "ppt"` | 是 | 文档类型 |
| `schemaVersion` | `string` | 是 | DSL 版本 |
| `title` | `string` | 否 | 文档标题 |
| `locale` | `string` | 否 | 语言区域 |
| `themeId` | `string` | 否 | 文档主题 |
| `assets` | `AssetRef[]` | 否 | 资源引用 |
| `dataSources` | `DataSourceDef[]` | 否 | 数据源定义 |
| `queries` | `QueryDef[]` | 否 | 查询定义 |
| `filters` | `FilterDef[]` | 否 | 过滤器定义 |
| `root` | `VNode` | 是 | 根节点 |

## 3.2 VNode（节点）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | `string` | 是 | 节点 ID |
| `kind` | `string` | 是 | 节点类型（如 `chart/table/slide/section/text`） |
| `name` | `string` | 否 | 展示名 |
| `layout` | `VLayout` | 否 | 布局 |
| `style` | `VStyle` | 否 | 样式 |
| `data` | `VDataBinding` | 否 | 数据绑定 |
| `props` | `NodeProps` | 否 | 组件配置 |
| `children` | `VNode[]` | 否 | 子节点 |

## 3.3 VLayout 模式

| 模式 | 必要字段 | 常用场景 |
|---|---|---|
| `flow` | `mode` | report 根容器 |
| `grid` | `mode,gx,gy,gw,gh` | dashboard |
| `absolute` | `mode,x,y,w,h` | ppt / slide |

---

## 4. 子域 DSL 映射关系

| 子域 | docType | 根节点建议 | 主体结构 |
|---|---|---|---|
| 图表/表格 | `dashboard/report/ppt` | 依宿主而定 | `chart/table` 作为 block 嵌入 |
| PPT | `ppt` | `container + absolute` | `slide -> text/chart/table` |
| DOC | `report` | `container + flow` | `section -> text/chart/table` |

---

## 5. 枚举总索引

## 5.1 DocType

`"chart" | "dashboard" | "report" | "ppt"`

## 5.2 LayoutMode

`"flow" | "grid" | "absolute"`

## 5.3 ChartType（主枚举）

`"auto" | "line" | "bar" | "pie" | "combo" | "scatter" | "radar" | "heatmap" | "kline" | "boxplot" | "sankey" | "graph" | "treemap" | "sunburst" | "parallel" | "funnel" | "gauge" | "calendar" | "custom"`

## 5.4 BindingRole（主枚举）

`"x" | "y" | "y1" | "y2" | "secondary" | "ysecondary" | "series" | "color" | "size" | "label" | "category" | "value" | "node" | "linkSource" | "linkTarget" | "linkValue" | "geo" | "lat" | "lng" | "tooltip" | "facet"`

## 5.5 其他常用枚举

1. `agg`: `sum/avg/min/max/count/distinctCount/p50/p95/p99`
2. `timeGrain`: `minute/hour/day/week/month`
3. `unit`: `bytes/bps/ms/pct/count`
4. `legendPos`: `top/right/bottom/left`
5. `pageSize`: `A4/Letter`
6. `deck.size`: `16:9/4:3`

---

## 6. 校验与执行链路

## 6.1 校验链路

1. 类型约束：`src/core/doc/types.ts`
2. 结构校验：`src/core/doc/schema.ts`
3. 运行时容错：各 runtime adapter
4. 导出端校验：`VDocValidator` + 导出器内部兜底

## 6.2 执行链路（概念）

1. DSL 进入编辑器
2. Node 渲染器按 `kind` 分发
3. chart/table adapter 生成运行态模型
4. 导出链路（POI）按 docType 生成 docx/pptx

---

## 7. 变更影响清单（新增字段/枚举时必看）

当你新增 DSL 字段或枚举值，至少同步以下 8 处：

1. `src/core/doc/types.ts`
2. `src/core/doc/schema.ts`
3. 前端 runtime 适配器（chart/table）
4. 编辑器属性面板（Inspector）
5. Java 导出解析器（ChartSpecParser/TableSpecParser）
6. Java 渲染器（PoiChartRenderer/Docx/Pptx 导出器）
7. 示例文件（`tools/poi-dsl-exporter/examples`）
8. 文档（本索引 + 三份子规范）与测试

---

## 8. 最小骨架模板（复制即用）

## 8.1 Report 骨架

```json
{
  "docId": "report_xxx",
  "docType": "report",
  "schemaVersion": "1.0.0",
  "root": {
    "id": "root",
    "kind": "container",
    "layout": { "mode": "flow" },
    "props": { "reportTitle": "报告标题", "tocShow": true, "coverEnabled": true },
    "children": []
  }
}
```

## 8.2 PPT 骨架

```json
{
  "docId": "ppt_xxx",
  "docType": "ppt",
  "schemaVersion": "1.0.0",
  "root": {
    "id": "root",
    "kind": "container",
    "props": { "size": "16:9", "defaultBg": "#ffffff" },
    "children": []
  }
}
```

---

## 9. 推荐使用顺序

1. 先看本索引，确定对象层级与枚举。
2. 再看子域文档，按场景抄“典型实例”。
3. 接入前先过 schema 校验，再跑导出用例。
4. 上线前检查新增枚举值（如 `combo/y2`）是否在你的链路中都已支持。
