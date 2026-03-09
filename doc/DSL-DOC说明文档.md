# DOC DSL 说明文档（详细规范版）

## 0. 文档定位

- 目标：明确 Report(DOC) DSL 的字段级规范、枚举、默认值和导出行为。
- 范围：`docType = "report"` 文档结构与 `section/text/chart/table` 业务块。
- 版本基线：`schemaVersion = 1.0.0`。

规范来源：

- `src/core/doc/types.ts`
- `src/core/doc/schema.ts`
- `tools/poi-dsl-exporter/examples/report-*.json`
- `tools/poi-dsl-exporter/src/main/java/com/chatbi/exporter/docx/ReportDocxExporter.java`

---

## 1. 顶层 VDoc 规范

```ts
interface VDoc {
  docId: string;
  docType: "report";
  schemaVersion: string;
  title?: string;
  locale?: string;
  themeId?: string;
  dataSources?: DataSourceDef[];
  queries?: QueryDef[];
  filters?: FilterDef[];
  root: VNode; // kind=container
}
```

### 1.1 顶层字段约束

| 字段 | 类型 | 必填 | 约束 |
|---|---|---:|---|
| `docId` | `string` | 是 | 非空 |
| `docType` | `"report"` | 是 | 固定值 |
| `schemaVersion` | `string` | 是 | 建议 `1.0.0` |
| `root` | `VNode` | 是 | 推荐 `kind=container` |

---

## 2. 根节点（Report 容器）规范

根节点建议：

- `kind = "container"`
- `layout.mode = "flow"`
- `children` 主要为 `section`

## 2.1 ReportProps（标准字段）

```ts
interface ReportProps {
  reportTitle?: string;
  tocShow?: boolean;
  headerShow?: boolean;
  footerShow?: boolean;
  pageSize?: "A4" | "Letter" | { w: number; h: number };
  paginationStrategy?: "section" | "continuous";
  marginPreset?: "narrow" | "normal" | "wide" | "custom";
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  coverEnabled?: boolean;
  coverTitle?: string;
  coverSubtitle?: string;
  coverNote?: string;
  summaryEnabled?: boolean;
  summaryTitle?: string;
  summaryText?: string;
  headerText?: string;
  footerText?: string;
  showPageNumber?: boolean;
  bodyPaddingPx?: number;
  sectionGapPx?: number;
  blockGapPx?: number;
  nativeChartEnabled?: boolean;
  nativeChartWidthEmu?: number;
  nativeChartHeightEmu?: number;
}
```

## 2.2 Report 扩展与布局字段（导出链路已支持）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `bodyPaddingPx` | `number` | `12` | 页面正文内边距（Web 预览 + DOC 导出映射） |
| `sectionGapPx` | `number` | `12` | 章节标题与正文块之间垂直间距 |
| `blockGapPx` | `number` | `8` | 正文块（文本/图表/表格）之间垂直间距 |
| `nativeChartEnabled` | `boolean` | `true` | 是否启用原生图表导出 |
| `nativeChartWidthEmu` | `number` | `6000000` 左右 | DOC 原生图宽 |
| `nativeChartHeightEmu` | `number` | `3200000` 左右 | DOC 原生图高 |

取值建议：

1. `bodyPaddingPx` 建议 `0 ~ 64`，导出端会钳制到 `0 ~ 120`。
2. `sectionGapPx` 建议 `0 ~ 32`，导出端会钳制到 `0 ~ 160`。
3. `blockGapPx` 建议 `0 ~ 24`，导出端会钳制到 `0 ~ 160`。

## 2.3 ReportProps 默认行为（导出端）

| 字段 | 默认值 |
|---|---|
| `coverEnabled` | `true` |
| `tocShow` | `true` |
| `summaryEnabled` | `true` |
| `headerShow` | `true` |
| `footerShow` | `true` |
| `showPageNumber` | `true` |
| `pageSize` | `"A4"` |
| `paginationStrategy` | `"section"` |
| `marginPreset` | `"normal"` |
| `normal` 页边距 | `14mm` |
| `narrow` 页边距 | `10mm` |
| `wide` 页边距 | `20mm` |
| `bodyPaddingPx` | `12` |
| `sectionGapPx` | `12` |
| `blockGapPx` | `8` |

目标态说明：

1. 统一采用 `marginPreset + margin*Mm` 表达页边距。
2. 当 `marginPreset=custom` 时，读取 `marginTopMm/rightMm/bottomMm/leftMm`（最小 6mm）。
3. 不再支持旧 `margin*Twips` 兼容输入。

## 2.4 布局字段映射（Web -> DOCX）

| DSL 字段 | Web 侧含义 | DOCX 导出映射 |
|---|---|---|
| `bodyPaddingPx` | `.report-page-body` 内边距 | 转换为段落前后空白基线（twips） |
| `sectionGapPx` | 章节标题下方间距 | 标题段落 `spacingAfter` |
| `blockGapPx` | 相邻 block 的纵向间距 | block 间插入 gap 段落 |

---

## 3. 章节与块结构规范

推荐层级：

1. `root(container/flow)`
2. `section(kind=section)`
3. `section.children = text/chart/table`

## 3.1 SectionProps

```ts
interface SectionProps {
  title: string;
}
```

## 3.2 TextProps

```ts
interface TextProps {
  text: string;
  format?: "plain" | "markdown-lite";
}
```

说明：

- DOC 导出主链路按普通文本渲染，`plain` 最稳定。

---

## 4. Chart/Table 在 DOC 中的使用

- `chart.props` 使用 `ChartSpec`（详见《DSL-图表与表格说明.md》）。
- `table.props` 使用 `TableSpec`（详见《DSL-图表与表格说明.md》）。

推荐约束：

1. chart 节点显式声明 `data.sourceId/queryId`。
2. table 节点尽量显式声明 `columns`，复杂场景声明 `headerRows` 与 `mergeCells`。
3. 需要跨页重复表头时，设置 `repeatHeader = true`。

---

## 5. 典型实例

## 5.1 最小可运行 Report（封面/目录/正文/总结）

```json
{
  "docId": "report_demo_001",
  "docType": "report",
  "schemaVersion": "1.0.0",
  "title": "网络周报",
  "locale": "zh-CN",
  "themeId": "theme.business.light",
  "root": {
    "id": "root",
    "kind": "container",
    "layout": { "mode": "flow" },
    "props": {
      "reportTitle": "网络周报",
      "tocShow": true,
      "coverEnabled": true,
      "coverTitle": "网络周报",
      "coverSubtitle": "Network Weekly Report",
      "coverNote": "数据截止：2026-03-01",
      "summaryEnabled": true,
      "summaryTitle": "执行摘要",
      "summaryText": "本周告警下降 12%，核心链路稳定。",
      "headerShow": true,
      "headerText": "网络周报 · 内部资料",
      "footerShow": true,
      "footerText": "Visual Document OS",
      "showPageNumber": true,
      "pageSize": "A4",
      "paginationStrategy": "section",
      "marginPreset": "normal",
      "marginTopMm": 14,
      "marginRightMm": 14,
      "marginBottomMm": 14,
      "marginLeftMm": 14,
      "bodyPaddingPx": 12,
      "sectionGapPx": 12,
      "blockGapPx": 8,
      "nativeChartEnabled": true
    },
    "children": [
      {
        "id": "sec_1",
        "kind": "section",
        "props": { "title": "1. 总览" },
        "children": [
          {
            "id": "txt_1",
            "kind": "text",
            "props": { "text": "本周整体表现良好，建议持续关注高峰时段链路。", "format": "plain" }
          },
          {
            "id": "chart_1",
            "kind": "chart",
            "data": { "sourceId": "ds_alarm", "queryId": "q_alarm" },
            "props": {
              "chartType": "line",
              "titleText": "告警趋势",
              "bindings": [
                { "role": "x", "field": "day" },
                { "role": "y", "field": "alarm_count", "agg": "sum" }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

## 5.2 章节混排（文本 + 图表 + 表格）

```json
{
  "id": "sec_ops",
  "kind": "section",
  "props": { "title": "2. 网络质量与容量" },
  "children": [
    {
      "id": "txt_ops_1",
      "kind": "text",
      "props": {
        "text": "本月可用性维持在 99.95% 以上，时延波动已完成专项治理。",
        "format": "plain"
      }
    },
    {
      "id": "chart_ops_1",
      "kind": "chart",
      "data": { "sourceId": "ds_network_day", "queryId": "q_network_day" },
      "props": {
        "chartType": "combo",
        "titleText": "SLA 与错误QPS",
        "bindings": [
          { "role": "x", "field": "day" },
          { "role": "y", "field": "availability_pct", "agg": "avg" },
          { "role": "y2", "field": "err_qps", "agg": "avg" }
        ],
        "legendShow": true
      }
    },
    {
      "id": "tbl_ops_1",
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
          { "key": "util_pct", "title": "利用率", "width": 120, "align": "right", "format": "pct" }
        ]
      }
    }
  ]
}
```

## 5.3 透视表章节

```json
{
  "id": "tbl_pivot",
  "kind": "table",
  "data": { "sourceId": "ds_capacity", "queryId": "q_capacity" },
  "props": {
    "titleText": "区域错误QPS透视",
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

## 6. 导出行为与约束

1. `root.children` 中仅 `kind=section` 会被当作正文章节处理。
2. section 之间自动分页；章节内部按块顺序渲染。
3. `table.repeatHeader=true` 会写入 DOC 表头重复标记。
4. 合并单元格通过原生 `hMerge/vMerge/gridSpan` 输出。
5. 图表优先原生导出，异常或不满足条件时回退占位卡片，不影响整文档生成。
6. `pageSize` 推荐只用 `"A4"` 或 `"Letter"`，自定义 `{w,h}` 可作为前端结构字段但 DOC 导出主链路以标准纸型更稳定。
7. 页边距仅按 `marginPreset + margin*Mm` 生效，不再读取 `margin*Twips`。

---

## 7. 编写规范建议

1. 每个 section 标题建议添加编号前缀（如 `1. 总览`），目录更稳定。
2. 根节点建议固定输出封面、目录、总结字段，便于模板化复用。
3. chart/table 节点统一引用数据源，不建议混用大量内联数据。
4. 对跨页大表，务必开启 `repeatHeader` 并限制 `maxRows`。
5. 双轴图建议显式使用 `role=y2` 或 `axis=secondary`，便于跨 Web/导出链路保持一致。
