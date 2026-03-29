# Visual DSL v2 规范说明（详细版）

状态：草案  
版本：v0.9  
日期：2026-03-29  
适用范围：`chart / doc / ppt` 三类文档协议  
目标：为后续架构评审、实现设计、Schema 治理、导出链路、AI 生成链路提供统一协议说明

---

## 1. 设计目标

`Visual DSL v2` 的目标不是“替代所有旧协议”，而是提供一份：

- 可治理
- 可扩展
- 可校验
- 可编辑
- 可渲染
- 可兼容存量系统

的目标协议。

它需要同时满足三类需求：

1. 新工程内部编辑器和运行时的统一内核需求
2. 老 DSL 在 `doc` 场景下的业务语义承接需求
3. 后续 `AI 生成 -> 预览 -> 编辑 -> 导出` 全链路的一致协议需求

---

## 2. 核心原则

### 2.1 分层原则

协议分成三层：

- 内容层：描述“文档长什么样”
- 数据层：描述“文档的数据从哪里来”
- 运行层：描述“文档在生成和执行过程中发生了什么”

### 2.2 Profile 原则

协议不再试图用一份字段同时覆盖所有文档类型，而是：

- 通用核心只承载共性
- 差异能力进入 `profile`

### 2.3 双轨原则

对于图表这类既需要编辑语义、又需要渲染语义的对象，允许同时存在两种表达：

- `bindings`：面向编辑和智能推荐
- `series`：面向兼容和显式渲染

### 2.4 Sidecar 原则

运行状态、Prompt、SQL、知识说明、追溯信息不再污染内容主 DSL，而是通过：

- `runtime`
- `annotations`

这两块承载。

### 2.5 强约束原则

下列内容应视为强约束：

- 根对象必须有 `schemaVersion`
- 根对象必须有 `profile`
- 核心节点必须有 `id`
- 结构化字段不能继续使用 JSON 字符串

---

## 3. 总体结构

`Visual DSL v2` 的统一结构如下：

```text
VisualDoc
├─ meta            # 文档基础元信息
├─ data            # 数据域：变量、过滤器、数据源、查询
├─ runtime         # 运行态 sidecar：状态、需求、节点状态
├─ annotations     # 文档级补充信息
└─ root            # 内容树（按 profile 不同而不同）
```

三类 profile 的根结构：

- `chart`
  - 根节点就是一个图表节点
- `doc`
  - 根节点是 `document`
  - 子节点可以是 `catalog` 或 `section`
- `ppt`
  - 根节点是 `deck`
  - 子节点是 `slide`

---

## 4. 通用核心定义

本章定义三类 profile 共用的协议对象。

### 4.1 `VisualDoc`

`VisualDoc` 是所有文档的统一根对象。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `meta` | `DocMeta` | 是 | 文档基础信息 |
| `data` | `DataDomain` | 否 | 数据域定义 |
| `runtime` | `RuntimeSidecar` | 否 | 运行态信息 |
| `annotations` | `Annotation[]` | 否 | 文档级补充信息 |
| `root` | `VNode` | 是 | 内容根节点 |

说明：

- `VisualDoc` 是协议统一入口。
- 不同 profile 的差异主要体现在 `meta.profile` 和 `root.kind`。

### 4.2 `DocMeta`

`DocMeta` 用于描述文档的基础信息，面向所有系统共享。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | `string` | 是 | 文档唯一标识 |
| `name` | `string` | 是 | 文档名称 |
| `profile` | `"chart" \| "doc" \| "ppt"` | 是 | 文档类型 profile |
| `schemaVersion` | `"2.0.0"` | 是 | 协议版本 |
| `subTitle` | `string` | 否 | 副标题 |
| `description` | `string` | 否 | 描述 |
| `templateId` | `string` | 否 | 来源模板 ID |
| `templateName` | `string` | 否 | 来源模板名称 |
| `version` | `string` | 否 | 文档版本 |
| `locale` | `string` | 否 | 语言区域 |
| `themeId` | `string` | 否 | 主题标识 |
| `category` | `string` | 否 | 分类 |
| `remark` | `string` | 否 | 备注 |
| `createdAt` | `string` | 否 | 创建时间 |
| `updatedAt` | `string` | 否 | 修改时间 |
| `createdBy` | `string` | 否 | 创建人 |
| `updatedBy` | `string` | 否 | 修改人 |

设计说明：

- `profile` 是后续 schema、驱动、导出、渲染分发的关键字段。
- `schemaVersion` 采用显式版本，不依赖隐式兼容。

### 4.3 `RuntimeSidecar`

`runtime` 用来承载内容协议之外的运行信息。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `status` | `ExecStatus` | 否 | 文档整体执行状态 |
| `requirement` | `string` | 否 | 原始需求/生成意图 |
| `nodeStatus` | `Record<string, ExecStatus>` | 否 | 节点执行状态 |
| `traces` | `Annotation[]` | 否 | 运行追踪信息 |

设计说明：

- 这部分信息不应参与正文内容排版。
- 这部分信息可能频繁变化，因此放在 sidecar 更合理。

### 4.4 `Annotation`

`Annotation` 是补充说明结构，用来统一承载：

- Prompt
- SQL
- API
- 知识说明
- 问题来源
- 备注

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `type` | 枚举 | 是 | 补充信息类型 |
| `name` | `string` | 否 | 显示名 |
| `value` | `string` | 是 | 主内容 |
| `appendix` | `string` | 否 | 附加内容 |

### 4.5 `VNode`

`VNode` 是统一节点结构，所有文档树中的节点都以它为基础。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | `string` | 是 | 节点唯一标识 |
| `kind` | `string` | 是 | 节点类型 |
| `name` | `string` | 否 | 节点展示名 |
| `layout` | `Layout` | 否 | 布局 |
| `style` | `Style` | 否 | 样式 |
| `data` | `NodeDataRef` | 否 | 节点数据引用 |
| `props` | `TProps` | 否 | 节点业务配置 |
| `annotations` | `Annotation[]` | 否 | 节点补充说明 |
| `children` | `VNode[]` | 否 | 子节点 |

设计说明：

- `VNode` 是统一树模型基础。
- `kind` 决定节点语义，`props` 决定节点配置。

### 4.6 `Layout`

`Layout` 表示节点布局方式。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `mode` | `"flow" \| "grid" \| "absolute"` | 是 | 布局模式 |
| `gx/gy/gw/gh` | `number` | 否 | 网格布局字段 |
| `x/y/w/h` | `number` | 否 | 绝对布局字段 |
| `z` | `number` | 否 | 层级 |
| `lock` | `boolean` | 否 | 是否锁定 |

设计说明：

- `doc` 主要使用 `flow`
- `ppt` 主要使用 `absolute`
- `chart` 独立文档通常不强调布局，但嵌入到 `doc/ppt` 时要遵循宿主布局

### 4.7 `Style`

`Style` 是统一样式对象。

主要字段说明：

- `bg / fg`：背景色、前景色
- `opacity`：透明度
- `borderW / borderC / radius`：边框和圆角
- `pad / mar`：内边距和外边距
- `font / fontSize / bold / italic / underline`：字体与字重
- `align / valign / lineHeight`：文本对齐与行高

设计说明：

- 样式对象保持轻量，不承载具体渲染引擎实现细节。
- 若某类节点有更强样式需求，可放入自身 `props` 中扩展。

### 4.8 `DataDomain`

`DataDomain` 是文档级数据域。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `variables` | `TemplateVar[]` | 否 | 模板变量 |
| `filters` | `FilterDef[]` | 否 | 过滤器 |
| `sources` | `DataSource[]` | 否 | 数据源 |
| `queries` | `QueryDef[]` | 否 | 查询定义 |

设计说明：

- 所有文档类型都可以共享同一套数据定义。
- 节点通过 `NodeDataRef` 引用数据域。

### 4.9 `NodeDataRef`

`NodeDataRef` 是节点级数据入口。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `sourceId` | `string` | 否 | 数据源 ID |
| `queryId` | `string` | 否 | 查询 ID |
| `inlineData` | `Record<string, unknown>[]` | 否 | 节点内联数据 |
| `params` | `Record<string, unknown>` | 否 | 查询参数 |
| `filterRefs` | `string[]` | 否 | 引用过滤器 |

设计说明：

- 这是新旧系统兼容的关键结构。
- 老系统可以继续直接给 `inlineData`。
- 新系统可以继续使用 `sourceId/queryId`。

### 4.10 字段定义相关结构

为了吸收老 DSL 的列定义、字段 UI 和血缘能力，定义以下对象：

#### `FieldDef`

用于统一描述字段本身。

| 字段 | 说明 |
|---|---|
| `key` | 字段唯一 key |
| `title` | 字段显示标题 |
| `businessName / businessNameCn` | 英文/中文业务名 |
| `type` | 字段类型 |
| `enumValues` | 枚举值配置 |
| `display` | 显示配置 |
| `lineage` | 血缘来源 |

#### `FieldDisplay`

用于统一描述字段展示方式。

包括：

- 展示优先级
- 数值格式
- 点击/悬停事件
- 映射值
- 跳转 URL

#### `FieldLineage`

用于统一描述数据血缘来源。

包括：

- 数据源名称
- 实际字段名
- 业务字段名

设计说明：

- `FieldDef` 是统一字段资产抽象。
- 后续图表、表格都可以直接复用这套字段定义。

---

## 5. Chart DSL 定义

`chart profile` 同时面向三类场景：

1. 独立图表文档
2. 嵌入在 `doc` 中的图表块
3. 嵌入在 `ppt` 中的图表块

### 5.1 `ChartDocument`

图表独立文档时，`root` 直接是图表节点。

### 5.2 `ChartSpec`

`ChartSpec` 是图表核心定义。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `chartType` | `ChartType` | 是 | 图表类型 |
| `title` | `string` | 否 | 主标题 |
| `subtitle` | `string` | 否 | 副标题 |
| `fields` | `FieldDef[]` | 否 | 字段定义 |
| `bindings` | `FieldBinding[]` | 否 | 编辑语义模型 |
| `series` | `SeriesSpec[]` | 否 | 渲染语义模型 |
| `xAxis` | `AxisSpec` | 否 | X 轴配置 |
| `yAxis` | `AxisSpec` | 否 | Y 轴配置 |
| `legend` | 对象 | 否 | 图例开关和位置 |
| `tooltip` | 对象 | 否 | 提示框配置 |
| `styleOptions` | 对象 | 否 | 平滑、堆叠、面积、标签等 |
| `renderOptions` | 对象 | 否 | ECharts 补丁、中心文案、轴分组等 |

约束说明：

- `bindings` 与 `series` 至少提供一种。
- 推荐编辑器以 `bindings` 为主写模型。

### 5.3 `ChartType`

推荐主枚举如下：

`auto / line / bar / pie / combo / scatter / radar / heatmap / kline / boxplot / sankey / graph / treemap / sunburst / parallel / funnel / gauge / calendar / custom`

说明：

- 使用 `kline` 统一表达蜡烛图，不再额外引入 `candlestick` 作为并列主类型。
- 若外部系统已有 `candlestick`，建议在驱动层做别名处理。

### 5.4 `FieldBinding`

`FieldBinding` 用于定义“字段在图表中的角色”。

常用角色：

- `x`：X 轴
- `y / y1 / y2`：Y 轴
- `series`：序列分组
- `category`：类别
- `value`：值
- `linkSource / linkTarget / linkValue`：关系图或桑基图

设计说明：

- `bindings` 更适合编辑器、字段推荐、AI 自动选图。

### 5.5 `SeriesSpec`

`SeriesSpec` 用于显式描述图表序列。

适用场景：

- 老 DSL 接入
- 渲染器需要精确 encode
- 一些无法仅靠 `bindings` 直接表达的场景

设计说明：

- 它不是编辑器唯一真相，但它是兼容旧系统的重要手段。

### 5.6 `renderOptions`

`renderOptions` 是图表的专家级扩展位。

它可以包含：

- `echartOption`
- `centerText`
- `subCenterText`
- `axisGroup`

约束说明：

- `renderOptions` 是扩展位，不是主定义位。
- 业务系统不应优先用 `echartOption` 直接代替 `ChartSpec`。

### 5.7 Chart 最小示例

```json
{
  "meta": {
    "id": "chart_001",
    "name": "告警趋势",
    "profile": "chart",
    "schemaVersion": "2.0.0"
  },
  "root": {
    "id": "chart_root",
    "kind": "chart",
    "props": {
      "chartType": "line",
      "title": "告警趋势",
      "bindings": [
        { "role": "x", "field": "day" },
        { "role": "y", "field": "alarm_count", "agg": "sum" }
      ]
    },
    "data": {
      "inlineData": [
        { "day": "Mon", "alarm_count": 12 },
        { "day": "Tue", "alarm_count": 18 }
      ]
    }
  }
}
```

---

## 6. Doc DSL 定义

`doc profile` 对应报告/文档型内容，目标导出通常为 `docx`。

### 6.1 根结构

`doc` 文档根节点使用 `kind = "document"`。

根节点子节点允许：

- `catalog`
- `section`

### 6.2 `DocRootProps`

`DocRootProps` 定义文档级能力。

包含以下几类能力：

- 文档标题
- 封面
- 摘要
- 目录开关
- 页眉页脚
- 分页与页边距
- 正文间距
- 原生图表导出设置

### 6.3 `CatalogNode`

`catalog` 是目录结构节点，不是正文渲染块。

作用：

- 表达目录层级
- 管理子目录与章节
- 作为导航和目录生成来源

推荐字段：

- `name`
- `isSummary`
- `summary`

### 6.4 `SectionNode`

`section` 是正文结构节点。

作用：

- 承载一组正文块
- 承载章节标题和章节摘要
- 作为正文分页、导出和运行时渲染的主要来源

推荐字段：

- `title`
- `level`
- `summary`

### 6.5 Doc 中的正文块

`section.children` 可以包含：

- `text`
- `chart`
- `table`
- `image`

这些块都是统一 `VNode` 的具体实例。

### 6.6 Doc 最小示例

```json
{
  "meta": {
    "id": "doc_001",
    "name": "网络周报",
    "profile": "doc",
    "schemaVersion": "2.0.0"
  },
  "root": {
    "id": "doc_root",
    "kind": "document",
    "layout": { "mode": "flow" },
    "props": {
      "reportTitle": "网络周报",
      "summary": { "enabled": true, "title": "执行摘要", "text": "本周整体稳定。" },
      "toc": { "enabled": true }
    },
    "children": [
      {
        "id": "catalog_1",
        "kind": "catalog",
        "props": { "name": "第一部分" },
        "children": [
          {
            "id": "section_1",
            "kind": "section",
            "props": { "title": "1. 总览", "level": 1 },
            "children": [
              {
                "id": "text_1",
                "kind": "text",
                "props": { "text": "本周表现良好。", "format": "plain" }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## 7. PPT DSL 定义

`ppt profile` 对应演示文档，目标导出通常为 `pptx`。

### 7.1 根结构

PPT 根节点使用 `kind = "deck"`。

`deck.children` 固定为 `slide`。

### 7.2 `PptRootProps`

`PptRootProps` 用于定义演示文档级属性。

主要包括：

- 画布尺寸
- 默认背景
- 母版 `master`
- 原生图表导出设置

### 7.3 `PptMaster`

`master` 用来定义整份演示文档共享的头尾与装饰属性。

主要包括：

- 页眉开关与文案
- 页脚开关与文案
- 页码开关
- 强调色
- 头尾留白与高度

### 7.4 `SlideNode`

`slide` 是 PPT 的页面节点。

要求：

- `layout.mode = "absolute"`
- 提供 `x/y/w/h`

推荐字段：

- `title`
- `layoutTemplateId`
- `bg`
- `notes`

### 7.5 Slide 中的内容块

`slide.children` 可以包含：

- `text`
- `chart`
- `table`
- `image`
- `shape`

这些节点都应使用绝对布局。

### 7.6 PPT 最小示例

```json
{
  "meta": {
    "id": "ppt_001",
    "name": "季度运营汇报",
    "profile": "ppt",
    "schemaVersion": "2.0.0"
  },
  "root": {
    "id": "deck_root",
    "kind": "deck",
    "props": {
      "size": "16:9",
      "defaultBg": "#ffffff",
      "master": {
        "showHeader": true,
        "headerText": "季度运营汇报",
        "showFooter": true,
        "footerText": "Visual DSL v2",
        "showSlideNumber": true
      }
    },
    "children": [
      {
        "id": "slide_1",
        "kind": "slide",
        "layout": { "mode": "absolute", "x": 0, "y": 0, "w": 960, "h": 540 },
        "props": { "title": "总览" },
        "children": [
          {
            "id": "title_1",
            "kind": "text",
            "layout": { "mode": "absolute", "x": 36, "y": 24, "w": 320, "h": 40 },
            "props": { "text": "季度运营总览", "format": "plain" }
          }
        ]
      }
    ]
  }
}
```

---

## 8. 约束、默认值与演进规则

### 8.1 强约束

以下规则应作为强约束：

1. 根对象必须有 `meta.profile`
2. 根对象必须有 `meta.schemaVersion`
3. 所有核心节点必须有 `id`
4. 结构化字段不得再使用 JSON 字符串承载
5. `chart` 至少要有 `bindings` 或 `series`
6. `ppt.slide` 必须采用 `absolute layout`

### 8.2 建议约束

以下规则建议采用，但可以在驱动层兼容老输入：

1. `doc.document.layout.mode` 使用 `flow`
2. `section` 标题尽量显式存在
3. 图表编辑器优先维护 `bindings`
4. `catalog` 作为目录节点，不直接承载正文块

### 8.3 不推荐继续沿用的旧定义

以下定义仅建议兼容读取，不建议继续新增：

- `Partial<BasicComponent>`
- `Section.content`
- `enumValues` 的 JSON 字符串
- `ui` 的 JSON 字符串
- 把运行状态继续写在内容主体中

### 8.4 演进策略

后续新增字段时，至少要同步：

1. `Visual DSL v2` 规范文档
2. 对应 profile schema
3. driver 层能力定义
4. 编辑器读写逻辑
5. 运行时渲染逻辑
6. 导出链路

---

## 9. Visual DSL v2 完整 TS 定义（带中文注释）

```ts
// ============================================================
// Visual DSL v2
// 说明：
// 1. 这是目标态协议定义，不等价于当前任何一套实现细节。
// 2. chart / doc / ppt 共用同一个 Common Core。
// 3. 运行态信息通过 runtime / annotations 承载，不再污染内容主树。
// ============================================================

// -----------------------------
// 通用基础枚举
// -----------------------------

/** 协议版本号。 */
export type SchemaVersion = "2.0.0";

/** 文档 profile。 */
export type DocProfile = "chart" | "doc" | "ppt";

/** 通用执行状态。 */
export type ExecStatus =
  | "draft"
  | "running"
  | "success"
  | "failed"
  | "finished"
  | "aborted"
  | "published";

/** 布局模式。 */
export type LayoutMode = "flow" | "grid" | "absolute";

/** 字段类型。 */
export type FieldType =
  | "string"
  | "boolean"
  | "int"
  | "long"
  | "float"
  | "double"
  | "timestamp"
  | "enum"
  | "json";

// -----------------------------
// 根文档结构
// -----------------------------

/** 所有文档的统一根对象。 */
export interface VisualDoc<TRoot extends VNode = VNode> {
  /** 文档基础元信息。 */
  meta: DocMeta;
  /** 文档级数据域。 */
  data?: DataDomain;
  /** 文档级运行态 sidecar。 */
  runtime?: RuntimeSidecar;
  /** 文档级补充说明。 */
  annotations?: Annotation[];
  /** 文档内容根节点。 */
  root: TRoot;
}

/** 文档基础元信息。 */
export interface DocMeta {
  /** 文档唯一标识。 */
  id: string;
  /** 文档名称。 */
  name: string;
  /** 文档 profile。 */
  profile: DocProfile;
  /** 协议版本。 */
  schemaVersion: SchemaVersion;
  /** 副标题。 */
  subTitle?: string;
  /** 描述。 */
  description?: string;
  /** 来源模板 ID。 */
  templateId?: string;
  /** 来源模板名称。 */
  templateName?: string;
  /** 文档版本号。 */
  version?: string;
  /** 语言区域。 */
  locale?: string;
  /** 主题标识。 */
  themeId?: string;
  /** 文档分类。 */
  category?: string;
  /** 备注。 */
  remark?: string;
  /** 创建时间。 */
  createdAt?: string;
  /** 更新时间。 */
  updatedAt?: string;
  /** 创建人。 */
  createdBy?: string;
  /** 更新人。 */
  updatedBy?: string;
}

/** 运行态信息，属于 sidecar，不属于内容主结构。 */
export interface RuntimeSidecar {
  /** 文档整体执行状态。 */
  status?: ExecStatus;
  /** 原始需求或生成意图。 */
  requirement?: string;
  /** 节点级状态。key 为 nodeId。 */
  nodeStatus?: Record<string, ExecStatus>;
  /** 运行追踪说明。 */
  traces?: Annotation[];
}

/** 补充说明结构，用于 Prompt、SQL、问题、知识说明等。 */
export interface Annotation {
  /** 补充信息类型。 */
  type: "question" | "prompt" | "summary" | "sql" | "api" | "knowledge" | "remark";
  /** 可选名称。 */
  name?: string;
  /** 主体内容。 */
  value: string;
  /** 附加说明。 */
  appendix?: string;
}

// -----------------------------
// 通用节点结构
// -----------------------------

/** 统一节点定义。 */
export interface VNode<TProps = Record<string, unknown>> {
  /** 节点唯一 ID。 */
  id: string;
  /** 节点类型。 */
  kind: string;
  /** 节点展示名。 */
  name?: string;
  /** 节点布局。 */
  layout?: Layout;
  /** 节点样式。 */
  style?: Style;
  /** 节点数据引用。 */
  data?: NodeDataRef;
  /** 节点业务属性。 */
  props?: TProps;
  /** 节点补充说明。 */
  annotations?: Annotation[];
  /** 子节点。 */
  children?: VNode[];
}

/** 通用布局结构。 */
export interface Layout {
  /** 布局模式。 */
  mode: LayoutMode;
  /** Grid X。 */
  gx?: number;
  /** Grid Y。 */
  gy?: number;
  /** Grid 宽度。 */
  gw?: number;
  /** Grid 高度。 */
  gh?: number;
  /** Absolute X。 */
  x?: number;
  /** Absolute Y。 */
  y?: number;
  /** Absolute 宽度。 */
  w?: number;
  /** Absolute 高度。 */
  h?: number;
  /** 层级。 */
  z?: number;
  /** 是否锁定。 */
  lock?: boolean;
}

/** 通用样式结构。 */
export interface Style {
  /** 背景色。 */
  bg?: string;
  /** 前景色。 */
  fg?: string;
  /** 透明度。 */
  opacity?: number;
  /** 边框宽度。 */
  borderW?: number;
  /** 边框颜色。 */
  borderC?: string;
  /** 圆角。 */
  radius?: number;
  /** 内边距。 */
  pad?: number | [number, number, number, number];
  /** 外边距。 */
  mar?: number | [number, number, number, number];
  /** 字体名。 */
  font?: string;
  /** 字号。 */
  fontSize?: number;
  /** 是否粗体。 */
  bold?: boolean;
  /** 是否斜体。 */
  italic?: boolean;
  /** 是否下划线。 */
  underline?: boolean;
  /** 水平对齐。 */
  align?: "left" | "center" | "right";
  /** 垂直对齐。 */
  valign?: "top" | "middle" | "bottom";
  /** 行高。 */
  lineHeight?: number;
}

// -----------------------------
// 数据域
// -----------------------------

/** 文档级数据域。 */
export interface DataDomain {
  /** 模板变量。 */
  variables?: TemplateVar[];
  /** 过滤器定义。 */
  filters?: FilterDef[];
  /** 数据源定义。 */
  sources?: DataSource[];
  /** 查询定义。 */
  queries?: QueryDef[];
}

/** 模板变量定义。 */
export interface TemplateVar {
  /** 变量 key。 */
  key: string;
  /** 变量显示名。 */
  label?: string;
  /** 变量类型。 */
  type: "string" | "number" | "boolean" | "date" | "datetime";
  /** 是否必填。 */
  required?: boolean;
  /** 默认值。 */
  defaultValue?: unknown;
  /** 描述。 */
  description?: string;
}

/** 过滤器定义。 */
export interface FilterDef {
  /** 过滤器 ID。 */
  id: string;
  /** 过滤器类型。 */
  type: "timeRange" | "select" | "multiSelect" | "text" | "numberRange";
  /** 标题。 */
  title?: string;
  /** 绑定字段。 */
  bindField?: string;
  /** 绑定参数。 */
  bindParam?: string;
  /** 作用域。 */
  scope?: "global" | { nodeId: string };
  /** 默认值。 */
  defaultValue?: unknown;
  /** 可选项。 */
  options?: Array<{ label: string; value: unknown }>;
}

/** 数据源定义。 */
export interface DataSource {
  /** 数据源 ID。 */
  id: string;
  /** 数据源类型。 */
  type: "static" | "remote";
  /** 静态数据。 */
  staticData?: unknown[];
  /** 远程地址。 */
  url?: string;
  /** 请求方法。 */
  method?: "GET" | "POST";
  /** 请求头。 */
  headers?: Record<string, string>;
  /** 默认参数。 */
  params?: Record<string, unknown>;
  /** 数据源字段结构。 */
  schema?: FieldDef[];
}

/** 查询定义。 */
export interface QueryDef {
  /** 查询 ID。 */
  id: string;
  /** 关联数据源 ID。 */
  sourceId: string;
  /** 查询类型。 */
  kind?: "sql" | "api" | "static";
  /** 查询文本。 */
  text?: string;
  /** 参数结构。 */
  paramSchema?: Record<
    string,
    {
      /** 参数类型。 */
      type?: "string" | "number" | "boolean" | "array";
      /** 是否必填。 */
      required?: boolean;
      /** 默认值。 */
      default?: unknown;
    }
  >;
}

/** 节点数据引用。 */
export interface NodeDataRef {
  /** 数据源 ID。 */
  sourceId?: string;
  /** 查询 ID。 */
  queryId?: string;
  /** 内联数据。 */
  inlineData?: Record<string, unknown>[];
  /** 查询参数。 */
  params?: Record<string, unknown>;
  /** 过滤器引用。 */
  filterRefs?: string[];
}

// -----------------------------
// 字段定义
// -----------------------------

/** 枚举值定义。 */
export interface EnumValue {
  /** 原始值。 */
  value: string;
  /** 显示标签。 */
  label: string;
  /** 可选颜色。 */
  color?: string;
}

/** 字段显示配置。 */
export interface FieldDisplay {
  /** 展示优先级。 */
  displayPriority?: number;
  /** 数值格式配置。 */
  valueFormat?: {
    /** 格式类型。 */
    type: "currency" | "percent" | "number" | "date";
    /** 单位。 */
    unit?: string;
    /** 小数位。 */
    decimals?: number;
  };
  /** 交互事件。 */
  event?: {
    /** 触发方式。 */
    type: "click" | "hover";
    /** 动作名称。 */
    action: string;
    /** 动作参数。 */
    params?: Record<string, unknown>;
  };
  /** 值映射。 */
  mapping?: Record<string, string>;
  /** 跳转 URL。 */
  url?: string;
}

/** 字段血缘来源。 */
export interface FieldLineage {
  /** 数据源名称。 */
  dataSourceName: string;
  /** 实际字段名。 */
  field: string;
  /** 英文业务名。 */
  businessName?: string;
  /** 中文业务名。 */
  businessNameCn?: string;
}

/** 统一字段定义。 */
export interface FieldDef {
  /** 字段 key。 */
  key: string;
  /** 字段标题。 */
  title?: string;
  /** 英文业务名。 */
  businessName?: string;
  /** 中文业务名。 */
  businessNameCn?: string;
  /** 字段类型。 */
  type?: FieldType;
  /** 枚举值配置。 */
  enumValues?: EnumValue[];
  /** 显示配置。 */
  display?: FieldDisplay;
  /** 血缘来源。 */
  lineage?: FieldLineage[];
}

// -----------------------------
// 通用内容块
// -----------------------------

/** 文本块属性。 */
export interface TextProps {
  /** 可选标题。 */
  title?: string;
  /** 文本内容。 */
  text: string;
  /** 文本格式。 */
  format?: "plain" | "markdown-lite";
}

/** 图片块属性。 */
export interface ImageProps {
  /** 资源 ID。 */
  assetId: string;
  /** 标题。 */
  title?: string;
  /** 替代文本。 */
  alt?: string;
  /** 填充方式。 */
  fit?: "contain" | "cover" | "stretch";
  /** 透明度。 */
  opacity?: number;
}

/** 表格列定义。 */
export interface TableColumn {
  /** 列 key。 */
  key: string;
  /** 列标题。 */
  title?: string;
  /** 列宽。 */
  width?: number;
  /** 对齐方式。 */
  align?: "left" | "center" | "right";
  /** 格式化。 */
  format?: string;
  /** 可选字段定义。 */
  field?: FieldDef;
}

/** 表格定义。 */
export interface TableSpec {
  /** 表格标题。 */
  title?: string;
  /** 表格列定义。 */
  columns: TableColumn[];
  /** 表格数据。 */
  rows?: Array<Record<string, unknown>>;
  /** 是否重复表头。 */
  repeatHeader?: boolean;
  /** 是否斑马纹。 */
  zebra?: boolean;
  /** 最大行数。 */
  maxRows?: number;
}

// -----------------------------
// Chart Profile
// -----------------------------

/** 图表类型。 */
export type ChartType =
  | "auto"
  | "line"
  | "bar"
  | "pie"
  | "combo"
  | "scatter"
  | "radar"
  | "heatmap"
  | "kline"
  | "boxplot"
  | "sankey"
  | "graph"
  | "treemap"
  | "sunburst"
  | "parallel"
  | "funnel"
  | "gauge"
  | "calendar"
  | "custom";

/** 字段绑定角色。 */
export type BindingRole =
  | "x"
  | "y"
  | "y1"
  | "y2"
  | "series"
  | "category"
  | "value"
  | "color"
  | "size"
  | "label"
  | "node"
  | "linkSource"
  | "linkTarget"
  | "linkValue";

/** 字段绑定定义。 */
export interface FieldBinding {
  /** 绑定角色。 */
  role: BindingRole;
  /** 字段名。 */
  field: string;
  /** 聚合方式。 */
  agg?: "sum" | "avg" | "min" | "max" | "count" | "distinctCount" | "p50" | "p95" | "p99";
  /** 轴归属。 */
  axis?: "primary" | "secondary" | number;
  /** 时间粒度。 */
  timeGrain?: "minute" | "hour" | "day" | "week" | "month";
  /** 单位。 */
  unit?: "bytes" | "bps" | "ms" | "pct" | "count";
  /** 排序方式。 */
  sort?: "asc" | "desc";
  /** TopK。 */
  topK?: number;
  /** 格式化。 */
  format?: string;
}

/** 坐标轴定义。 */
export interface AxisSpec {
  /** 坐标轴类型。 */
  type: "category" | "value" | "time" | "log";
  /** 坐标轴名称。 */
  name?: string;
}

/** 显式序列定义，用于兼容旧系统与精细渲染。 */
export interface SeriesSpec {
  /** 序列类型。 */
  type: "line" | "bar" | "pie" | "scatter" | "radar" | "gauge" | "kline";
  /** 子类型。 */
  subType?: "area" | "horizontal" | "ring";
  /** 序列名称。 */
  name: string;
  /** 编码映射。 */
  encode: Record<string, string>;
  /** 扩展配置。 */
  config?: Record<string, unknown>;
}

/** 图表定义。 */
export interface ChartSpec {
  /** 图表类型。 */
  chartType: ChartType;
  /** 主标题。 */
  title?: string;
  /** 副标题。 */
  subtitle?: string;
  /** 字段定义。 */
  fields?: FieldDef[];
  /** 绑定式图表定义。 */
  bindings?: FieldBinding[];
  /** 序列式图表定义。 */
  series?: SeriesSpec[];
  /** X 轴配置。 */
  xAxis?: AxisSpec;
  /** Y 轴配置。 */
  yAxis?: AxisSpec;
  /** 图例配置。 */
  legend?: {
    /** 是否显示图例。 */
    show?: boolean;
    /** 图例位置。 */
    position?: "top" | "right" | "bottom" | "left";
  };
  /** Tooltip 配置。 */
  tooltip?: {
    /** 是否显示。 */
    show?: boolean;
  };
  /** 风格选项。 */
  styleOptions?: {
    /** 是否平滑。 */
    smooth?: boolean;
    /** 是否堆叠。 */
    stack?: boolean;
    /** 是否面积图。 */
    area?: boolean;
    /** 是否显示标签。 */
    labelShow?: boolean;
  };
  /** 渲染扩展选项。 */
  renderOptions?: {
    /** 底层图表引擎补丁。 */
    echartOption?: Record<string, unknown>;
    /** 中心文本。 */
    centerText?: string;
    /** 副中心文本。 */
    subCenterText?: string;
    /** 坐标轴分组。 */
    axisGroup?: string[];
  };
}

/** 图表节点。 */
export type ChartNode = VNode<ChartSpec> & { kind: "chart" };

/** 图表独立文档。 */
export type ChartDocument = VisualDoc<ChartNode> & {
  meta: DocMeta & { profile: "chart" };
  root: ChartNode;
};

// -----------------------------
// Doc Profile
// -----------------------------

/** 页眉页脚配置。 */
export interface HeaderFooterSpec {
  /** 是否显示。 */
  show?: boolean;
  /** 文本。 */
  text?: string;
  /** 样式。 */
  style?: Style;
  /** 是否显示页码。 */
  showPageNumber?: boolean;
}

/** 封面配置。 */
export interface DocCover {
  /** 是否启用封面。 */
  enabled?: boolean;
  /** 封面标题。 */
  title?: string;
  /** 封面副标题。 */
  subTitle?: string;
  /** 封面模板标识。 */
  template?: string;
  /** 封面内容项。 */
  contents?: Array<{
    /** 内容类型。 */
    type: "image" | "text";
    /** 内容值。 */
    content: string;
    /** 模板元素 ID。 */
    elementId: string;
  }>;
  /** 封面备注。 */
  note?: string;
}

/** 摘要配置。 */
export interface DocSummary {
  /** 是否启用摘要。 */
  enabled?: boolean;
  /** 摘要标题。 */
  title?: string;
  /** 摘要正文。 */
  text?: string;
}

/** 页面配置。 */
export interface DocPageSpec {
  /** 页面尺寸。 */
  size?: "A4" | "Letter" | { w: number; h: number };
  /** 分页策略。 */
  paginationStrategy?: "section" | "continuous";
  /** 页边距预设。 */
  marginPreset?: "narrow" | "normal" | "wide" | "custom";
  /** 上边距。 */
  marginTopMm?: number;
  /** 右边距。 */
  marginRightMm?: number;
  /** 下边距。 */
  marginBottomMm?: number;
  /** 左边距。 */
  marginLeftMm?: number;
}

/** 文档根属性。 */
export interface DocRootProps {
  /** 报告标题。 */
  reportTitle?: string;
  /** 封面配置。 */
  cover?: DocCover;
  /** 摘要配置。 */
  summary?: DocSummary;
  /** 目录配置。 */
  toc?: { enabled?: boolean };
  /** 页眉配置。 */
  header?: HeaderFooterSpec;
  /** 页脚配置。 */
  footer?: HeaderFooterSpec;
  /** 页面配置。 */
  page?: DocPageSpec;
  /** 正文间距配置。 */
  body?: {
    /** 正文内边距。 */
    paddingPx?: number;
    /** 章节间距。 */
    sectionGapPx?: number;
    /** 块间距。 */
    blockGapPx?: number;
  };
  /** 原生图表导出配置。 */
  nativeChart?: {
    /** 是否启用。 */
    enabled?: boolean;
    /** 导出宽度。 */
    widthEmu?: number;
    /** 导出高度。 */
    heightEmu?: number;
  };
}

/** 目录节点属性。 */
export interface CatalogProps {
  /** 目录名称。 */
  name: string;
  /** 是否摘要目录。 */
  isSummary?: boolean;
  /** 目录说明。 */
  summary?: string;
}

/** 章节节点属性。 */
export interface SectionProps {
  /** 章节标题。 */
  title: string;
  /** 章节层级。 */
  level?: 1 | 2 | 3;
  /** 章节摘要。 */
  summary?: string;
}

/** 文本节点。 */
export type TextNode = VNode<TextProps> & { kind: "text" };
/** 图片节点。 */
export type ImageNode = VNode<ImageProps> & { kind: "image" };
/** 表格节点。 */
export type TableNode = VNode<TableSpec> & { kind: "table" };

/** 章节内容块。 */
export type DocBlock = TextNode | ChartNode | TableNode | ImageNode;

/** 章节节点。 */
export type SectionNode = VNode<SectionProps> & {
  kind: "section";
  children?: DocBlock[];
};

/** 目录节点。 */
export type CatalogNode = VNode<CatalogProps> & {
  kind: "catalog";
  children?: Array<CatalogNode | SectionNode>;
};

/** 文档根节点。 */
export type DocRootNode = VNode<DocRootProps> & {
  kind: "document";
  layout: { mode: "flow" };
  children?: Array<CatalogNode | SectionNode>;
};

/** 文档型文档。 */
export type DocDocument = VisualDoc<DocRootNode> & {
  meta: DocMeta & { profile: "doc" };
  root: DocRootNode;
};

// -----------------------------
// PPT Profile
// -----------------------------

/** PPT 母版定义。 */
export interface PptMaster {
  /** 是否显示页眉。 */
  showHeader?: boolean;
  /** 页眉文本。 */
  headerText?: string;
  /** 页眉样式。 */
  headerStyle?: Style;
  /** 是否显示页脚。 */
  showFooter?: boolean;
  /** 页脚文本。 */
  footerText?: string;
  /** 页脚样式。 */
  footerStyle?: Style;
  /** 是否显示页码。 */
  showSlideNumber?: boolean;
  /** 强调色。 */
  accentColor?: string;
  /** 水平留白。 */
  paddingX?: number;
  /** 页眉顶部偏移。 */
  headerTop?: number;
  /** 页眉高度。 */
  headerHeight?: number;
  /** 页脚底部偏移。 */
  footerBottom?: number;
  /** 页脚高度。 */
  footerHeight?: number;
}

/** PPT 根属性。 */
export interface PptRootProps {
  /** 画布尺寸。 */
  size?: "16:9" | "4:3" | { w: number; h: number };
  /** 默认背景。 */
  defaultBg?: string;
  /** 母版定义。 */
  master?: PptMaster;
  /** 原生图表导出配置。 */
  nativeChart?: {
    /** 是否启用。 */
    enabled?: boolean;
    /** 导出宽度。 */
    widthEmu?: number;
    /** 导出高度。 */
    heightEmu?: number;
  };
}

/** Slide 属性。 */
export interface SlideProps {
  /** 页面标题。 */
  title?: string;
  /** 模板布局 ID。 */
  layoutTemplateId?: string;
  /** 页面背景。 */
  bg?: string;
  /** 页面备注。 */
  notes?: string;
}

/** 简单形状节点属性。 */
export interface ShapeProps {
  /** 形状类型。 */
  shape: "rect" | "line" | "ellipse";
  /** 可选文本。 */
  text?: string;
}

/** 形状节点。 */
export type ShapeNode = VNode<ShapeProps> & { kind: "shape" };

/** Slide 中的内容块。 */
export type SlideBlock = TextNode | ChartNode | TableNode | ImageNode | ShapeNode;

/** Slide 节点。 */
export type SlideNode = VNode<SlideProps> & {
  kind: "slide";
  layout: { mode: "absolute"; x: number; y: number; w: number; h: number };
  children?: SlideBlock[];
};

/** PPT 根节点。 */
export type PptRootNode = VNode<PptRootProps> & {
  kind: "deck";
  children?: SlideNode[];
};

/** PPT 文档。 */
export type PptDocument = VisualDoc<PptRootNode> & {
  meta: DocMeta & { profile: "ppt" };
  root: PptRootNode;
};
```
