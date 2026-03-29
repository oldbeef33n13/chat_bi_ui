# Visual DSL v2 评审稿（老 DSL 改造视角）

状态：草案  
版本：v0.9  
日期：2026-03-29  
适用范围：老 DSL 在 `report/chart` 场景下的保留、补强与治理  
评审对象：架构、前端、后端、AI、测试、存量系统负责人

---

## 1. 评审目标

这份评审稿不再从“新旧 DSL 如何统一”的总览角度展开，而是聚焦一个更具体、更可执行的问题：

**对于已经在线上或存量系统中使用的老 DSL，我们到底要改什么、不改什么、为什么要改、准备怎么改，以及每一项改造的代价与收益是什么。**

本稿默认以下前提成立：

1. 老 DSL 仍然有现实价值，不能简单废弃。
2. 当前阶段不做全量替换，不要求所有存量系统迁移到新工程内核协议。
3. 新工程需要为老 DSL 提供可接入、可编辑、可渲染、可评审的能力。
4. 本次评审的重点不是写转换器，而是定义老 DSL 的“可持续演进方向”。

---

## 2. 结论

### 2.1 总体结论

老 DSL 不建议废弃，但必须治理。  
建议把老 DSL 的后续处理分成四类：

1. `保留`：继续承认其业务价值，尤其是 `report/doc` 场景下的业务语义。
2. `补强`：为编辑器、校验器和运行时补足必要能力。
3. `收敛`：把含混表达收敛成单一主表达。
4. `冻结`：对明显不合理的旧定义停止继续扩展，仅保留兼容读取。

### 2.2 对老 DSL 的核心判断

老 DSL 的优点：

- 业务语义强，特别适合报告生成和结果交换
- `Report / Catalog / Section / Cover / Summary` 结构符合报告场景
- `ChartComponent.series` 模型对渲染器友好
- `additionalInfos / requirement / lineage` 对 AI 与审计有价值

老 DSL 的主要问题：

- 内容、状态、追踪信息混在一起
- 结构表达不收敛
- 编辑语义不足
- 校验能力弱
- 局部定义过于宽松或过于动态

### 2.3 这次评审的落脚点

本次不讨论“老 DSL 要不要保留”，而是明确以下三件事：

1. 老 DSL 哪些定义必须调整，否则无法长期演进。
2. 老 DSL 哪些定义可以保留，但需要补足边界和约束。
3. 老 DSL 哪些定义不再接受继续扩展。

---

## 3. 边界

### 3.1 本次改造覆盖范围

本次评审只讨论老 DSL 在以下范围内的改造：

- `Report`
- `Catalog`
- `Section`
- `TextComponent`
- `TableComponent`
- `ChartComponent`
- `Column / Field / Lineage / AdditionalInfo`

### 3.2 本次不覆盖的范围

本次不要求老 DSL 直接承担以下职责：

- 完整的 PPT `deck / slide / absolute layout / master` 协议
- 新工程内部命令系统的直接存储结构
- UI 临时态
- 导出任务状态
- 协同编辑状态

### 3.3 重要边界结论

老 DSL 未来仍然主要服务于：

- 报告生成
- 报告结果交换
- 报告类渲染
- 图表与表格的业务语义表达

老 DSL **不应该**继续向“完整 PPT 协议”方向扩展。  
如果要支持 PPT，应该由独立的 `ppt profile` 承担，而不是把老 DSL 继续补字段补成另一种协议。

---

## 4. 老 DSL 改造清单

本章是评审重点。每个变更项都按以下四个问题展开：

- 要变更什么
- 为什么要做
- 怎么做
- 原因与取舍

### 4.1 变更点一：根对象补齐协议版本与协议类型

#### 要变更什么

在老 DSL 根对象 `Report` 上补齐以下协议级字段：

- `schemaVersion`
- `profile`

建议新增后最小结构如下：

```ts
interface LegacyReportRoot {
  schemaVersion: "1.x" | "2.0.0";
  profile: "doc";
  basicInfo: BasicInfo;
  status?: ReportStatus;
  cover?: Cover;
  overview?: string;
  catalogs?: Catalog[];
}
```

#### 为什么要做

当前老 DSL 最大的问题之一，是它更像“业务对象定义”，而不是“协议对象定义”。  
缺少协议版本和协议类型，带来的问题包括：

- 无法做稳定版本治理
- 无法做 schema 分支
- 后续引入新字段时没有明确边界
- 不利于后续接入 `Visual DSL v2`

#### 怎么做

1. 在老 DSL 根对象增加 `schemaVersion`
2. 固定 `profile = "doc"`，明确它是报告类协议
3. 历史存量数据没有该字段时，在读取层补默认值
4. 新写入数据必须显式带版本

#### 原因与取舍

这是低成本、高收益改造。  
代价是所有写入入口都要补字段，但收益是后续治理开始有“版本抓手”。

### 4.2 变更点二：组件 `id` 与 `layout` 不再允许弱约束

#### 要变更什么

老 DSL 当前组件定义是：

- `TextComponent extends Partial<BasicComponent>`
- `TableComponent extends Partial<BasicComponent>`
- `ChartComponent extends Partial<BasicComponent>`

这意味着：

- `id` 可以缺失
- `layout` 可以缺失

建议改为：

- 组件 `id` 必填
- 对可编辑组件，`layout` 必填
- 对仅生成结果型组件，允许由驱动层补默认布局，但不能长期保持 `Partial`

#### 为什么要做

编辑器的任何稳定能力都依赖可定位节点：

- 选中
- 拖拽
- 排序
- patch
- undo/redo

如果节点没有稳定 `id`，这些能力会非常脆弱。  
如果布局长期可缺失，编辑器只能不断猜测。

#### 怎么做

建议逐步收敛为：

```ts
interface LegacyComponentBase {
  id: string;
  layout?: ComponentLayout;
}
```

并增加约定：

1. `id` 在所有组件中强制必填
2. `layout` 在编辑态写回结果中强制存在
3. 旧数据缺 `id/layout` 时，在接入层补齐一次后持久化

#### 原因与取舍

这会触及所有组件生成入口，但这是让老 DSL 具备“可编辑性”的前提。  
如果不改，后续所有编辑能力都会建立在脆弱的补丁逻辑上。

### 4.3 变更点三：`Section.content` 与 `Section.components` 收敛为一种主表达

#### 要变更什么

当前老 DSL 同时存在：

- `content?: BIEngineComponent`
- `components?: BIEngineComponent[]`

这会导致一个章节可能有两种内容承载方式。

建议收敛规则：

- 以 `components` 作为唯一长期主表达
- `content` 仅保留兼容读取，不再允许新写入

#### 为什么要做

同一语义存在两种表达，会导致：

- 渲染器逻辑分叉
- 编辑器逻辑分叉
- patch 路径不稳定
- AI 输出不稳定

这不是“灵活性”，而是“歧义”。

#### 怎么做

1. 读取层兼容：
   - 若 `content` 存在且 `components` 为空，则转成单元素 `components`
2. 写回层统一：
   - 一律写 `components`
3. 文档约束更新：
   - `content` 标记为 deprecated

#### 原因与取舍

这是最值得做的收敛项之一。  
代价很小，但能显著降低后续实现复杂度。

### 4.4 变更点四：内容协议与运行状态拆开

#### 要变更什么

老 DSL 当前把以下状态直接写在内容结构中：

- `Report.status`
- `Section.status`
- `overviewStatus`
- `Catalog.status`

建议拆分：

- 内容结构保留最少的稳定状态字段
- 运行过程状态迁移到 `runtime sidecar`

#### 为什么要做

原因有三个：

1. 内容结构关注“是什么”，运行状态关注“现在怎么样”
2. 运行状态频繁变化，不适合污染内容协议
3. 渲染、导出、编辑通常需要内容稳定，运行状态是短生命周期信息

#### 怎么做

建议中间态改法：

1. 旧字段继续兼容读取
2. 新设计里新增：

```ts
interface LegacyRuntimeSidecar {
  reportStatus?: ReportStatus;
  overviewStatus?: ComponentStatus;
  sectionStatus?: Record<string, ComponentStatus>;
  catalogStatus?: Record<string, ComponentStatus>;
}
```

3. 新写入优先写 sidecar
4. 老字段逐步降级为只读兼容

#### 原因与取舍

拆开后模型会多一层，但协议边界会清晰很多。  
这是“从业务对象走向可治理协议”的必要动作。

### 4.5 变更点五：`overview` 从孤立字符串升级为正式的摘要结构

#### 要变更什么

当前老 DSL 有：

- `overview: string`
- `overviewStatus?: ComponentStatus`

建议升级为正式摘要结构，例如：

```ts
interface LegacySummary {
  enabled?: boolean;
  title?: string;
  content?: string;
  status?: ComponentStatus;
}
```

#### 为什么要做

单个字符串有两个问题：

- 语义太弱
- 无法自然承载标题、开关、状态、样式等能力

摘要是报告的重要组成部分，不应只是一个裸字符串字段。

#### 怎么做

1. 新增 `summary` 结构
2. 兼容读取时：
   - `overview -> summary.content`
   - `overviewStatus -> summary.status`
3. 新写入不再直接写 `overview`

#### 原因与取舍

这会增加一个对象层级，但语义明显更完整，也更接近后续 `doc profile` 的目标结构。

### 4.6 变更点六：`Catalog` 保留，但职责明确化

#### 要变更什么

`Catalog` 不删除，但要明确它的职责：

- 它是“结构组织节点”
- 它不是“正文块节点”

同时建议补充目录层约束：

- `Catalog` 负责组织 `subCatalogs` 与 `sections`
- 正文渲染主要由 `Section` 负责

#### 为什么要做

`Catalog` 是老 DSL 的优势语义之一。  
如果删掉它，目录结构会丢。  
如果不明确它的职责，运行时和编辑器又会把它当成正文结构滥用。

#### 怎么做

1. 保留 `Catalog`
2. 在规范里明确：
   - `Catalog` 用于目录、导航、分组
   - `Section` 用于正文
3. 后续统一协议中，可以让 `catalog` 成为正式节点类型

#### 原因与取舍

这是“保留优势、补足边界”的典型改造，不是推翻式改造。

### 4.7 变更点七：`AdditionalInfo` 保留，但迁移为注释/追踪模型

#### 要变更什么

当前老 DSL 的：

- `additionalInfos`
- `requirement`

本质上都属于补充信息，而不是内容主体。

建议：

- `AdditionalInfo` 保留
- 但协议定位改为 `annotations / traces`
- `requirement` 迁移到运行侧

#### 为什么要做

这部分信息非常有价值：

- 能表达 Prompt
- 能表达 SQL
- 能表达知识来源
- 能表达原始问题

但它们不应与正文内容处于同一级主结构语义中。

#### 怎么做

1. 保留类型定义
2. 规范中改名定位为：
   - `annotations`
   - `runtime.requirement`
3. 存量字段继续兼容读取
4. 新写入走新位置

#### 原因与取舍

不建议删除这类信息，因为它对 AI、审计、回溯都很重要。  
真正需要改变的是“它放在哪一层”。

### 4.8 变更点八：字段定义与列定义结构化，不再接受 JSON 字符串字段

#### 要变更什么

老 DSL 当前存在两个明显不合理的点：

- `LineageSource.enumValues: string`
- `LineageSource.ui: string`

建议改为结构化字段：

- `enumValues?: EnumValue[]`
- `ui?: FieldUI`

#### 为什么要做

把结构化信息塞进字符串，会导致：

- 无法 schema 校验
- 无法稳定 diff
- 无法在编辑器里直接修改
- 容易产生格式不一致

#### 怎么做

1. 在结构上新增强类型字段
2. 历史读取时解析字符串 JSON
3. 解析成功后统一进入结构化对象
4. 新写入禁止再输出字符串 JSON

#### 原因与取舍

这项改造会影响上下游接口，但它必须做。  
否则字段血缘和显示配置永远只能停留在“半结构化状态”。

### 4.9 变更点九：图表从“仅渲染模型”升级为“渲染 + 编辑双语义模型”

#### 要变更什么

老 DSL 当前图表定义核心是：

- `columns`
- `data`
- `xAxis / yAxis`
- `series`
- `options`

这套定义对渲染很好，但对编辑不足。  
建议保留 `series`，并新增更适合编辑器的字段绑定层：

- `bindings`
- `fields`
- `dataRef`

#### 为什么要做

图表编辑器需要回答的问题是：

- 哪个字段是维度
- 哪个字段是指标
- 哪个字段在第二轴
- 可以自动推荐什么图

这些问题单靠 `series.encode` 很难稳定回答。

#### 怎么做

建议图表中间态改为：

```ts
interface LegacyChartComponentV2 {
  type: "chart";
  id: string;
  layout?: ComponentLayout;
  title?: string;
  columns?: Column[];
  data?: Record<string, any>[];
  dataRef?: {
    sourceId?: string;
    queryId?: string;
    params?: Record<string, unknown>;
  };
  bindings?: FieldBinding[];
  series?: Series[];
  xAxis?: Axis;
  yAxis?: Axis;
  options?: ChartOption;
}
```

约定：

1. `series` 保留，继续服务旧渲染链路
2. `bindings` 作为编辑器与智能推荐主模型
3. 允许两者并存

#### 原因与取舍

这是老 DSL 最关键的一项能力补强。  
代价是图表定义更复杂，但换来的是：

- 可编辑
- 可推荐
- 可兼容

### 4.10 变更点十：数据输入从“只支持内联”扩展为“内联 + 引用”

#### 要变更什么

老 DSL 当前的 `TableComponent` 和 `ChartComponent` 都直接带：

- `data: Record<string, any>[]`

建议继续保留 `data`，但新增 `dataRef`，支持：

- 数据源引用
- 查询引用
- 参数引用

#### 为什么要做

只允许内联数据的限制是：

- 数据复用差
- 不利于实时查询
- 不利于过滤器联动
- 不利于和新工程数据链路对接

#### 怎么做

建议新增：

```ts
interface LegacyDataRef {
  sourceId?: string;
  queryId?: string;
  params?: Record<string, unknown>;
}
```

并约定优先级：

1. 若存在 `data`，可直接渲染
2. 若不存在 `data` 且存在 `dataRef`，走查询
3. 编辑器保存时可按场景选择保留 `data` 或写为 `dataRef`

#### 原因与取舍

这项改造不会破坏旧渲染行为，但能显著增强协议与数据域的衔接能力。

### 4.11 变更点十一：老 DSL 不再继续扩成 PPT 协议

#### 要变更什么

这里不是“加字段”，而是“明确不加什么字段”。

建议明确：

- 老 DSL 不再继续补 `deck / slide / master / absolute layout`
- 老 DSL 不承担完整 PPT 编辑协议职责

#### 为什么要做

报告 DSL 和 PPT DSL 不是一类布局协议：

- 报告是流式结构
- PPT 是页面绝对布局结构

如果为了“统一”把两者强揉在一起，最后会得到一份更复杂、更不稳定的协议。

#### 怎么做

1. 在评审中明确：
   - 老 DSL 继续服务 `doc/report`
   - `ppt` 使用独立 profile
2. 存量若需要导出演示材料，可通过适配层生成 `ppt profile`
3. 不再直接往老 DSL 上继续补 PPT 专属字段

#### 原因与取舍

这项决策会减少“单协议幻觉”，但能显著降低后续架构失控风险。

### 4.12 变更点十二：建立“停止扩展项”清单

#### 要变更什么

对以下旧定义做冻结，不再继续扩展：

- `Partial<BasicComponent>`
- `Section.content`
- JSON 字符串形式的 `enumValues / ui`
- 以 `eChartOption: any` 代替主图表定义
- 把运行状态继续写在内容主结构中

#### 为什么要做

如果不冻结，团队在有交付压力时一定会继续沿这些旧口子加字段，导致治理失败。

#### 怎么做

1. 规范文档里标注 deprecated
2. 接入层继续兼容读
3. 新写入一律禁止使用
4. 代码评审按“停止扩展项”执行

#### 原因与取舍

这类动作听起来偏治理，但实际上是协议重构能否成功的关键。

---

## 5. 原因与取舍总表

为了便于评审会快速过决策，这里把主要改造的取舍汇总如下。

| 变更项 | 收益 | 代价 | 建议 |
|---|---|---|---|
| 根对象补版本/类型 | 便于治理与版本演进 | 写入方补字段 | 必做 |
| `id` 强制化 | 支持稳定编辑 | 需要补历史数据 | 必做 |
| `content -> components` 收敛 | 降低实现复杂度 | 需要兼容转换 | 必做 |
| 状态 sidecar 化 | 协议分层清晰 | 模型多一层 | 必做 |
| `overview -> summary` 结构化 | 摘要语义完整 | 增加对象层级 | 建议做 |
| `Catalog` 保留并定责 | 保留业务语义 | 结构稍复杂 | 建议做 |
| `AdditionalInfo` 迁移定位 | AI/审计可保留 | 需要重定义位置 | 必做 |
| 字段结构化 | 可校验、可编辑 | 接口有调整 | 必做 |
| 图表双语义模型 | 可编辑且兼容旧渲染 | 图表协议更复杂 | 必做 |
| `dataRef` 扩展 | 支持数据联动 | 增加数据读取路径 | 建议做 |
| 不再扩成 PPT 协议 | 降低架构风险 | 协议数量不是 1 份 | 必做 |
| 停止扩展项冻结 | 防止继续失控 | 需要治理约束 | 必做 |

---

## 6. 决策项

本次评审建议明确以下决策。

### 6.1 是否确认老 DSL 保留，但必须治理

推荐结论：

- 通过

### 6.2 是否确认 `report/doc` 是老 DSL 的主要保留场景

推荐结论：

- 通过

### 6.3 是否确认 `Section.content` 退出长期主表达

推荐结论：

- 通过

### 6.4 是否确认组件 `id` 必须强制存在

推荐结论：

- 通过

### 6.5 是否确认运行状态从内容主体中拆出

推荐结论：

- 通过

### 6.6 是否确认 `enumValues/ui` 不再接受 JSON 字符串

推荐结论：

- 通过

### 6.7 是否确认图表引入 `bindings + series` 双模型

推荐结论：

- 通过

### 6.8 是否确认老 DSL 不继续向 PPT 协议扩展

推荐结论：

- 通过

### 6.9 是否确认建立“停止扩展项”清单

推荐结论：

- 通过

---

## 7. 一句话结论

这次评审的重点不是“老 DSL 要不要留下”，而是“老 DSL 要以什么样的边界和质量留下来”。结论是：**保留它的业务语义，补强它的编辑与治理能力，收敛它的歧义表达，冻结它不合理的扩展口子。**
