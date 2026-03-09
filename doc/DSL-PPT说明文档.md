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
  masterShowHeader?: boolean;
  masterHeaderText?: string;
  masterShowFooter?: boolean;
  masterFooterText?: string;
  masterShowSlideNumber?: boolean;
  masterAccentColor?: string;
  masterPaddingXPx?: number;
  masterHeaderTopPx?: number;
  masterHeaderHeightPx?: number;
  masterFooterBottomPx?: number;
  masterFooterHeightPx?: number;
  nativeChartEnabled?: boolean;
  nativeChartWidthEmu?: number;
  nativeChartHeightEmu?: number;
}
```

目标态说明：

1. 上述字段为正式 DSL 字段，不属于临时扩展。
2. Web 运行态与 Java 导出态使用同一默认语义，不做旧版兼容分支。

## 2.2 Deck 字段级约束

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `root.kind` | `string` | 是 | - | 推荐固定 `container` |
| `root.props.size` | `"16:9" \| "4:3" \| {w,h}` | 否 | `16:9` | 画布比例 |
| `root.props.defaultBg` | `string` | 否 | `#ffffff`（常规） | 默认背景色 |
| `root.props.masterShowHeader` | `boolean` | 否 | `true` | 母版页眉显示 |
| `root.props.masterHeaderText` | `string` | 否 | `doc.title` | 母版页眉文案 |
| `root.props.masterShowFooter` | `boolean` | 否 | `true` | 母版页脚显示 |
| `root.props.masterFooterText` | `string` | 否 | `"Visual Document OS"` | 母版页脚文案 |
| `root.props.masterShowSlideNumber` | `boolean` | 否 | `true` | 母版页码显示 |
| `root.props.masterAccentColor` | `string` | 否 | `#1d4ed8` | 母版分隔线强调色 |
| `root.props.masterPaddingXPx` | `number` | 否 | `24` | 母版头脚左右内边距（像素） |
| `root.props.masterHeaderTopPx` | `number` | 否 | `12` | 母版页眉顶部偏移（像素） |
| `root.props.masterHeaderHeightPx` | `number` | 否 | `26` | 母版页眉最小高度（像素） |
| `root.props.masterFooterBottomPx` | `number` | 否 | `10` | 母版页脚底部偏移（像素） |
| `root.props.masterFooterHeightPx` | `number` | 否 | `22` | 母版页脚最小高度（像素） |
| `root.props.nativeChartEnabled` | `boolean` | 否 | `true` | 原生图表导出开关 |
| `root.children` | `VNode[]` | 否 | 空 | 子节点应为 `slide` |

取值建议：

1. `masterPaddingXPx` 建议 `12 ~ 48`。
2. `masterHeaderTopPx` 建议 `0 ~ 36`，`masterHeaderHeightPx` 建议 `18 ~ 40`。
3. `masterFooterBottomPx` 建议 `0 ~ 24`，`masterFooterHeightPx` 建议 `16 ~ 36`。

## 2.3 母版布局字段映射（Web -> PPTX）

| DSL 字段 | Web 侧含义 | PPTX 导出映射 |
|---|---|---|
| `masterPaddingXPx` | 母版头脚左右留白 | header/footer 文本框左右边界 |
| `masterHeaderTopPx` | 页眉顶部位置 | header 文本框 `y` |
| `masterHeaderHeightPx` | 页眉高度 | header 文本框 `h` |
| `masterFooterBottomPx` | 页脚距底部位置 | footer 文本框 `y = pageH - bottom - height` |
| `masterFooterHeightPx` | 页脚高度 | footer 文本框 `h` |

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
      "props": {
        "size": "16:9",
        "defaultBg": "#ffffff",
        "masterShowHeader": true,
        "masterHeaderText": "季度运营汇报",
        "masterShowFooter": true,
        "masterFooterText": "Visual Document OS",
        "masterShowSlideNumber": true,
        "masterAccentColor": "#1d4ed8",
        "masterPaddingXPx": 24,
        "masterHeaderTopPx": 12,
        "masterHeaderHeightPx": 26,
        "masterFooterBottomPx": 10,
        "masterFooterHeightPx": 22,
        "nativeChartEnabled": true
      },
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
3. `masterShowHeader/masterShowFooter/masterShowSlideNumber` 控制母版头脚与页码渲染。
4. `masterHeaderText/masterFooterText/masterAccentColor` 会同步映射到 Web 运行态与 Java 导出态。
5. `masterPaddingXPx/masterHeaderTopPx/masterHeaderHeightPx/masterFooterBottomPx/masterFooterHeightPx` 控制母版头脚位置与尺寸，并与 Java 导出保持一致。
6. `slide.props.bg` 优先级高于 `root.props.defaultBg`。
7. 表格节点使用原生表格输出，支持多级表头与合并。
8. 未支持块类型会渲染占位，不会中断整页导出。

---

## 8. 编写规范建议

1. slide 内节点尽量显式给 `x/y/w/h`，并保证不越界。
2. 文本块优先 `format="plain"`，降低跨端差异。
3. 图表块建议总是提供 `data.sourceId + queryId`，避免运行时找不到数据。
4. 使用 `layoutTemplateId` 标注版式语义，便于后续模板系统自动识别与替换。
5. 大型汇报建议按“封面 -> 议程 -> 结论页 -> 数据页 -> 决策页”结构组织，便于自动化生成。
