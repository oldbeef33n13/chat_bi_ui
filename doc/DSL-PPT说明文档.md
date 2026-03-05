# PPT DSL 说明文档（详细规范版）

## 0. 文档定位

- 目标：明确 PPT 文档 DSL 的字段级规范、枚举、默认值、运行行为。
- 范围：`docType = "ppt"` 文档及其 `container -> slide -> block` 结构。
- 版本基线：`schemaVersion = 1.0.0`。

规范来源：

- `src/core/doc/types.ts`
- `src/core/doc/schema.ts`
- `tools/poi-dsl-exporter/examples/ppt-*.json`
- `tools/poi-dsl-exporter/src/main/java/com/chatbi/exporter/pptx/DeckPptxExporter.java`

---

## 1. 顶层 VDoc 规范

```ts
interface VDoc {
  docId: string;
  docType: "ppt";
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
| `docType` | `"ppt"` | 是 | 固定值 |
| `schemaVersion` | `string` | 是 | 非空，当前建议 `1.0.0` |
| `root` | `VNode` | 是 | `kind` 推荐 `container` |

---

## 2. 根节点（Deck）规范

## 2.1 DeckProps

```ts
interface DeckProps {
  size?: "16:9" | "4:3" | { w: number; h: number };
  defaultBg?: string;
}
```

常用扩展字段（运行/导出端已使用）：

- `nativeChartEnabled?: boolean`：是否启用 POI 原生图表导出（默认 true）

## 2.2 Deck 字段级约束

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `root.kind` | `string` | 是 | - | 推荐固定 `container` |
| `root.props.size` | `"16:9" \| "4:3" \| {w,h}` | 否 | `16:9` | 画布比例 |
| `root.props.defaultBg` | `string` | 否 | `#ffffff`（常规） | 默认背景色 |
| `root.children` | `VNode[]` | 否 | 空 | 子节点应为 `slide` |

---

## 3. Slide 层规范

## 3.1 SlideProps

```ts
interface SlideProps {
  title?: string;
  layoutTemplateId?: string;
  bg?: string;
}
```

## 3.2 Slide 推荐布局规范

| 项目 | 建议值 |
|---|---|
| `slide.kind` | `slide` |
| `slide.layout.mode` | `absolute` |
| 16:9 画布 | `w=960, h=540` |
| 4:3 画布 | `w=960, h=720` |

说明：

- schema 允许其它 layout mode，但当前 PPT 编辑/导出主链路按绝对布局最稳定。

---

## 4. Slide 子块规范

当前主链路支持：

1. `kind = "text"`（`TextProps`）
2. `kind = "chart"`（`ChartSpec`）
3. `kind = "table"`（`TableSpec`）

不支持类型会进入占位渲染（`UnsupportedNodeRenderer`）。

## 4.1 TextProps

```ts
interface TextProps {
  text: string;
  format?: "plain" | "markdown-lite";
}
```

## 4.2 常用 style 字段（PPT 场景）

| 字段 | 类型 | 常见值 | 说明 |
|---|---|---|---|
| `fontSize` | `number` | `14~44` | 字号 |
| `bold` | `boolean` | `true/false` | 粗体 |
| `bg` | `string` | `#f8fbff` | 背景色 |
| `pad` | `number \| [t,r,b,l]` | `12` | 内边距 |
| `borderW` | `number` | `1` | 边框宽 |
| `borderC` | `string` | `#dbeafe` | 边框色 |
| `radius` | `number` | `8~12` | 圆角 |

---

## 5. 布局与坐标字段（absolute）

`VLayout` 在 PPT 里主要使用这些字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `mode` | `"absolute"` | 是 | 布局模式 |
| `x` | `number` | 建议必填 | 左上角 X |
| `y` | `number` | 建议必填 | 左上角 Y |
| `w` | `number` | 建议必填 | 宽 |
| `h` | `number` | 建议必填 | 高 |
| `z` | `number` | 否 | 层级 |
| `lock` | `boolean` | 否 | 锁定 |

---

## 6. 典型实例

## 6.1 最小可运行 PPT（1 页）

```json
{
  "docId": "ppt_demo_001",
  "docType": "ppt",
  "schemaVersion": "1.0.0",
  "title": "季度运营汇报",
  "locale": "zh-CN",
  "themeId": "theme.business.light",
  "root": {
    "id": "root",
    "kind": "container",
    "props": { "size": "16:9", "defaultBg": "#ffffff", "nativeChartEnabled": true },
    "children": [
      {
        "id": "slide_1",
        "kind": "slide",
        "props": { "title": "总览" },
        "layout": { "mode": "absolute", "x": 0, "y": 0, "w": 960, "h": 540 },
        "children": [
          {
            "id": "title_1",
            "kind": "text",
            "layout": { "mode": "absolute", "x": 36, "y": 26, "w": 320, "h": 48, "z": 1 },
            "props": { "text": "季度运营总览", "format": "plain" },
            "style": { "fontSize": 28, "bold": true }
          },
          {
            "id": "chart_1",
            "kind": "chart",
            "layout": { "mode": "absolute", "x": 36, "y": 94, "w": 430, "h": 260, "z": 1 },
            "data": { "sourceId": "ds_ops", "queryId": "q_ops" },
            "props": {
              "chartType": "line",
              "titleText": "告警趋势",
              "bindings": [
                { "role": "x", "field": "week" },
                { "role": "y", "field": "alarm_count", "agg": "sum" }
              ]
            }
          },
          {
            "id": "summary_1",
            "kind": "text",
            "layout": { "mode": "absolute", "x": 492, "y": 94, "w": 430, "h": 260, "z": 1 },
            "props": { "text": "关键结论：\n1) 告警下降\n2) 时延稳定", "format": "plain" },
            "style": { "bg": "#f8fbff", "pad": 12, "borderW": 1, "borderC": "#dbeafe", "radius": 8 }
          }
        ]
      }
    ]
  }
}
```

## 6.2 图表 + 总结左右布局（模板语义）

```json
{
  "id": "slide_growth_lr",
  "kind": "slide",
  "props": { "title": "经营增长", "layoutTemplateId": "chart-summary-lr" },
  "layout": { "mode": "absolute", "x": 0, "y": 0, "w": 960, "h": 540 },
  "children": []
}
```

## 6.3 图表 + 总结上下布局（模板语义）

```json
{
  "id": "slide_growth_tb",
  "kind": "slide",
  "props": { "title": "利润与订单", "layoutTemplateId": "chart-summary-tb" },
  "layout": { "mode": "absolute", "x": 0, "y": 0, "w": 960, "h": 540 },
  "children": []
}
```

---

## 7. 运行与导出行为

1. `root.props.size` 决定导出页尺寸：
   - `16:9 -> 960x540`
   - `4:3 -> 960x720`
2. `root.props.nativeChartEnabled` 为 true 时，优先原生图表导出。
3. `slide.props.bg` 优先级高于 `root.props.defaultBg`。
4. 表格节点使用原生表格输出，支持多级表头与合并。
5. 未支持块类型会渲染占位，不会中断整页导出。

---

## 8. 编写规范建议

1. slide 内节点尽量显式给 `x/y/w/h`，并保证不越界。
2. 文本块优先 `format="plain"`，降低跨端差异。
3. 图表块建议总是提供 `data.sourceId + queryId`，避免运行时找不到数据。
4. 使用 `layoutTemplateId` 标注版式语义，便于后续模板系统自动识别与替换。
5. 大型汇报建议按“封面 -> 议程 -> 结论页 -> 数据页 -> 决策页”结构组织，便于自动化生成。
