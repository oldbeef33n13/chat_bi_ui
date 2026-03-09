# Report Section Canvas UX 方案

## 0. 文档目标

- 日期：2026-03-06
- 目标：把 report 编辑体验从“理解结构后再操作”改成“直接拖拽编辑，系统自动约束”
- 范围：仅覆盖 report 的传统编辑体验，同时为后续智能化预留统一动作、埋点和外部接口

## 1. 结论

report 不应继续强化“章节 > row > block”的显式操作，也不应直接照搬 PPT 的全自由 absolute 画布。

更适合当前产品的方案是：

`章节画布（Section Canvas） + 智能吸附（Smart Guides） + 轻模板（Starter Layouts） + 一键整理（Auto Tidy）`

其中最关键的取舍是：

- 用户看到的是接近 PPT 的直接操作
- 系统内部仍以 `grid` 为主做落盘和导出
- `absolute` 只用于编辑态手势、局部浮层元素或后续高级能力

这是一种“编辑像 PPT，存储仍偏 grid”的混合模型。

## 2. 为什么不能直接做成纯 PPT

纯 PPT 式 absolute 布局虽然上手简单，但放到 report 有三个明显问题：

1. DOC/PDF 导出链路会失去结构性，版式稳定性明显下降
2. 长文档会很快变成“大画布堆元素”，维护成本高
3. AI、模板和批量整理会更难稳定执行

当前代码和 DSL 已经同时支持 `grid` 与 `absolute`：

- [types.ts](/d:/GitHub/chat_bi_ui/src/core/doc/types.ts)
- [report-layout.ts](/d:/GitHub/chat_bi_ui/src/ui/utils/report-layout.ts)
- [alignment.ts](/d:/GitHub/chat_bi_ui/src/ui/utils/alignment.ts)

因此更合理的做法不是推翻模型，而是把 `grid` 藏到系统内部，把“像 PPT 一样拖拽”的体验做在编辑层。

## 3. 目标心智

用户面对 report 时，不需要再理解 row、preset、插入锚点这些内部概念。

用户心智应收敛为 5 件事：

1. 点空白处插入图表、文本、表格、KPI
2. 拖动元素到想要的位置
3. 拖拽边角调整大小
4. 多选后对齐、均分、等宽高
5. 如果布局乱了，点一下“整理版式”

系统负责：

- 吸附到安全边距、列网格、相邻元素边缘、中心线
- 自动避免明显重叠
- 在提交时把结果转换成稳定的 `grid` 布局
- 在导出时继续走现有 report 渲染链路

## 4. 目标交互

### 4.1 章节画布

每个章节的正文区改成一个或多个“章节画布页”：

- 每页是固定宽度的纸面预览区
- 默认显示页边距安全区
- 默认显示弱化网格和对齐辅助线
- 页之间纵向排列，符合 report 阅读习惯

用户看到的是“章节中的若干页”，而不是“章节下的一串 row”。

### 4.2 插入

插入不再以“在哪个 row 前后插入”为主，而是以“在当前画布哪里插入”为主。

高频入口：

- 空白处 `+`
- 右键菜单
- 顶部插入面板
- 拖入组件卡片

插入流程：

1. 用户点击画布空白处或拖入组件
2. 系统在点击点生成落点预览
3. 用户选择组件类型或轻模板
4. 系统先放一个默认尺寸，再自动吸附到最近可用区域

默认插入项：

- 单图
- 双图对比
- 图文
- 表图
- KPI 卡
- 文本说明

### 4.3 移动

移动时必须提供强反馈：

- 拖拽对象半透明
- 出现蓝色参考线
- 出现候选落点框
- 显示与相邻元素的对齐关系
- 靠近页边距或列线时自动吸附

释放时的提交规则：

- 优先落到隐形列网格
- 若与邻近块发生轻度冲突，自动做局部整理
- 若冲突严重，给出明显重叠态，用户释放后执行“推开”或“整理”

### 4.4 缩放

缩放以直接拖动角点为主，不暴露 `gw/gh`。

规则：

- 宽度按列吸附
- 高度按基础节拍吸附
- 图表默认保留合理最小尺寸
- 文本块可允许更自由的高度增长
- 多选时支持等宽、等高

### 4.5 多选编排

多选后显示浮动工具条，只保留高频能力：

- 左对齐
- 右对齐
- 顶对齐
- 底对齐
- 水平均分
- 垂直均分
- 等宽
- 等高
- 置顶
- 置底

这部分可以直接复用现有 [alignment.ts](/d:/GitHub/chat_bi_ui/src/ui/utils/alignment.ts) 和 [layout-batch.ts](/d:/GitHub/chat_bi_ui/src/ui/utils/layout-batch.ts) 的能力。

### 4.6 一键整理

“整理版式”是 report 场景非常关键的兜底动作。

触发时机：

- 用户主动点击“整理版式”
- 插入多个元素后系统推荐
- 检测到重叠过多时建议触发

整理动作优先级：

1. 保留元素相对顺序
2. 保留主元素尺寸
3. 优先贴齐列网格
4. 自动分组成单列、双列、三列或图文

这个动作的本质是把“自由操作后的结果”重新投影回结构化布局。

## 5. 设计原则

### 5.1 直接操作优先

用户先拖、先放、先缩；系统再帮他约束。

### 5.2 护栏默认开启

不能要求用户自己理解网格和导出约束，护栏必须默认存在：

- 安全边距
- 吸附
- 智能参考线
- 自动均分建议
- 一键整理

### 5.3 内部结构下沉

`row` 可以继续存在于内部算法和导出映射层，但不应再作为主要 UI 概念暴露给用户。

### 5.4 report 与 PPT 分工明确

report 倾向于：

- 纸面阅读
- 纵向分页
- 内容整理优先

PPT 倾向于：

- 单页表达
- 自由摆放
- 演示编排优先

report 可以借鉴 PPT 的交互方式，但不应复制它的底层模型。

## 6. 对现有 DSL 的最小改造

### 6.1 保留当前节点树

继续保持：

- `report`
- `section`
- `chart / table / text`

不在第一阶段新增 `row` 节点，也不引入新的章节页节点。

### 6.2 新增 section 级编辑配置

建议在 `SectionProps` 或 `section.props` 中补这些字段：

```ts
type SectionEditorMode = "canvas";

interface SectionCanvasProps {
  editorMode?: SectionEditorMode;
  canvasCols?: number;
  canvasPageHeightPx?: number;
  canvasSnapPx?: number;
  canvasGapPx?: number;
  canvasPaddingPx?: number;
  canvasOverflow?: "paginate" | "grow";
}
```

建议默认值：

- `editorMode = "canvas"`
- `canvasCols = 12`
- `canvasPageHeightPx = 960`
- `canvasSnapPx = 8`
- `canvasGapPx = 16`
- `canvasPaddingPx = 24`
- `canvasOverflow = "paginate"`

这些字段只服务编辑器，不影响文档消费端语义。

### 6.3 核心块仍以 grid 落盘

report 核心块继续优先使用：

```ts
layout: {
  mode: "grid",
  gx,
  gy,
  gw,
  gh
}
```

原因：

- 现有 report 布局工具链已经依赖 `grid`
- Java 导出链路对结构化布局更稳定
- AI 和模板的语义动作更容易做

### 6.4 absolute 的使用边界

在 report 中，`absolute` 建议只用于：

- 编辑手势中的临时预览态
- 注释、角标、徽标、说明箭头等浮层元素
- 后续高级模式中的“脱离布局”对象

不建议把图表、表格、正文文本默认存成 `absolute`。

## 7. 编辑态与存储态的转换

### 7.1 编辑态

章节画布中，每个块都可以被映射成一个像素矩形：

- `left`
- `top`
- `width`
- `height`

拖拽和缩放期间只更新前端临时 UI state，不直接写 DSL。

### 7.2 提交态

用户释放鼠标后，系统执行：

1. 像素矩形吸附到隐形 12 列网格和垂直节拍
2. 生成新的 `gx / gy / gw / gh`
3. 必要时触发局部整理
4. 通过 `UpdateLayout` / `Transaction` 提交

### 7.3 页面投影

章节内的“页”在第一阶段不需要作为 DSL 节点存储，可以用派生方式计算：

- 根据 `gy / gh`
- 根据章节画布页高
- 自动投影为第几页

这样能减少模型改动，同时保留多页预览能力。

## 8. 命令与埋点预留

这一轮仍然是传统交互优先，但动作层必须按语义化设计。

建议新增或统一这些语义动作：

```ts
type ReportCanvasSemanticAction =
  | "insert_block_at_point"
  | "move_block_on_canvas"
  | "resize_block_on_canvas"
  | "align_blocks_on_canvas"
  | "distribute_blocks_on_canvas"
  | "apply_starter_layout"
  | "auto_tidy_section"
  | "paginate_section_canvas";
```

推荐事件参数：

- `doc_id`
- `doc_type`
- `section_id`
- `node_id`
- `selection_count`
- `source`
- `canvas_page_index`
- `drop_zone`
- `snap_result`
- `layout_before`
- `layout_after`
- `latency_ms`
- `success`

这样后续无论接 AI、脚本化外部 API，还是智能建议，都能复用同一语义层。

## 9. 组件与代码改造建议

### 9.1 ReportEditor

[ReportEditor.tsx](/d:/GitHub/chat_bi_ui/src/ui/editors/ReportEditor.tsx)

建议拆成 3 层：

1. `ReportSectionCanvas`
2. `SectionCanvasPage`
3. `CanvasBlockFrame`

职责：

- `ReportSectionCanvas` 负责章节级页投影、工具条、空状态
- `SectionCanvasPage` 负责页面背景、安全区、吸附线、落点层
- `CanvasBlockFrame` 负责选中框、拖拽、缩放、多选状态

### 9.2 report-layout

[report-layout.ts](/d:/GitHub/chat_bi_ui/src/ui/utils/report-layout.ts)

新增两类能力：

- `grid -> canvas rect` 投影
- `canvas rect -> snapped grid` 提交

同时补：

- 页索引计算
- 重叠检测
- 局部整理

### 9.3 report-row-actions

[report-row-actions.ts](/d:/GitHub/chat_bi_ui/src/ui/utils/report-row-actions.ts)

建议逐步降级为兼容层：

- 保留现有 row 语义能力用于旧逻辑和整理算法
- 新增 canvas action builder
- 长期可以演进为 `report-canvas-actions.ts`

### 9.4 telemetry

[editor-telemetry.ts](/d:/GitHub/chat_bi_ui/src/ui/telemetry/editor-telemetry.ts)

继续扩充 trigger source 和 canvas 事件，不再只围绕 row 行为。

### 9.5 导出链路

当前阶段不建议改 Java 导出器的模型假设。

原因：

- 若 report 仍以 `grid` 为主落盘，DOCX 导出基本不需要推翻
- 画布分页与导出分页可以先解耦
- 先把编辑体验做顺，再补更强的导出一致性

## 10. 推荐实施顺序

### P0：先改交互壳，不改数据模型

目标：

- 用“章节画布”替代当前显式 row 心智
- 在视觉上先让用户像操作 PPT 一样编辑 report

工作：

- 章节画布页 UI
- 安全区
- 选中框
- 空白处插入
- 块拖拽移动
- 基础吸附线

### P1：补缩放与稳定提交

工作：

- 八向缩放手柄
- `canvas rect -> grid` 吸附提交
- 最小尺寸约束
- 冲突检测

### P2：补整理与轻模板

工作：

- 一键整理
- 双图 / 三图 / 图文模板
- 自动均分建议
- 插入后的智能补位

### P3：补高级元素与智能预留

工作：

- 浮层注释元素
- 对外语义 API
- 智能布局建议
- 自动摘要与主动分析入口

## 11. 明确不做

这一阶段不建议做：

1. 无限高度自由画布
2. 默认 absolute 落盘
3. 暴露 row 级复杂控制给普通用户
4. 把 report 和 PPT 完全统一成一套底层布局模型
5. 先做 AI 再补传统交互

## 12. 参考依据

以下判断来自官方资料的综合推断，而不是某一家产品的原话：

- PowerPoint 更强调拖拽、吸附、对齐、均分和布局建议
- Figma 更强调直接操作之上的 Auto Layout 护栏
- Tableau 默认推荐结构化布局，floating 是例外
- Gamma 用卡片和页级组织降低长文档复杂度

参考链接：

- https://support.microsoft.com/en-au/office/align-or-arrange-objects-bfd91078-2078-4b35-8672-f6270690b3b8
- https://support.microsoft.com/en-gb/office/work-with-gridlines-and-use-snap-to-grid-in-powerpoint-84ed7394-5b37-4326-b13d-60fbc845e096
- https://support.microsoft.com/en-us/office/create-professional-slide-layouts-with-designer-53c77d7b-dc40-45c2-b684-81415eac0617
- https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout
- https://help.figma.com/hc/en-us/articles/360040450513-Create-layout-guides
- https://help.tableau.com/current/pro/desktop/en-us/dashboards_organize_floatingandtiled.htm
- https://help.gamma.app/en/articles/11016396-what-are-cards-in-gamma-and-how-to-do-they-work
- https://help.gamma.app/en/articles/11047840-how-can-i-import-slides-or-documents-into-gamma
