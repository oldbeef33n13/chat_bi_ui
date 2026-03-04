# Visual Document OS (ChatBI UI)

基于 `doc/设计文档.md` 与 `doc/验收规格.md` 落地的首版工程实现，包含统一 DSL、命令内核、三类编辑器、Chat 命令计划预览与执行链路。

## 快速开始

```bash
npm install
npm run dev
```

## 已落地模块

- 统一 DSL：
  - `VDoc / VNode / ChartSpec / Filter / DataSource / Query / CommandPlan`
  - JSON Schema 常量 + 运行时轻量校验器（同源枚举约束）
- 统一编辑内核：
  - `Selection / Command / Patch / History / Undo/Redo / Transaction`
  - 审计日志（AI/UI 修改都记录）
- Runtime：
  - `DataEngine`（取消、debounce、cache、retry）
  - `ChartSpec -> ECharts` 适配
  - 渲染器注册基础
- 编辑器：
  - Dashboard（grid 卡片拖拽/resize + 预览模式）
  - Report（章节与块编辑、快捷插入）
  - PPT（缩略图管理、绝对布局拖拽/resize、基础吸附线）
- ChatBridge：
  - `CommandPlan` 输入/推断
  - Diff Preview
  - Accept/Reject + Undo
- 模板与主题：
  - 主题 tokens 示例
  - Dashboard/Report/PPT 模板样例

## 目录结构

```text
src/
  core/
    doc/             # DSL、schema、patch、默认文档
    kernel/          # command executor、store、history、audit
  runtime/
    chart/           # ChartSpec -> ECharts
    data/            # DataEngine
    plugin/          # registry 结构
    template/        # 模板
    theme/           # 主题
  ui/
    components/      # 左中右三栏
    editors/         # Dashboard / Report / PPT
    hooks/           # data hooks
    state/           # provider + signal hook
```

## 验证命令

```bash
npm run typecheck
npm run test
npm run build
```

## 当前测试

- `src/core/kernel/editor-store.test.ts`
  - 命令执行 + Undo/Redo
  - CommandPlan 预览 + 接受
