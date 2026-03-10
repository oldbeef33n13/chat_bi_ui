# Visual Document OS (ChatBI UI)

基于 `doc/设计文档.md` 与 `doc/验收规格.md` 落地的首版工程实现，包含统一 DSL、命令内核、三类编辑器、Chat 命令计划预览与执行链路。

## 快速开始

```bash
npm install
mvn -f tools/pom.xml -pl chatbi-app-server -am org.springframework.boot:spring-boot-maven-plugin:run
npm run dev
```

## 一站式启动与测试

推荐直接使用统一脚本：

```bash
npm run stack:init
npm run stack:dev
```

`stack:dev` 会在控制台输出：

- 运行时数据目录
- 后端日志文件路径
- 前端日志文件路径

如果本地 `.runtime/storage/dev` 中的 SQLite/Flyway 状态和当前代码不兼容，脚本会自动重置该目录并重试一次。

展示模式：

```bash
npm run stack:showcase
```

全链路自动化测试：

```bash
npm run test:all
```

更多说明见 [本地启动初始化与自动化测试](./doc/%E6%9C%AC%E5%9C%B0%E5%90%AF%E5%8A%A8%E5%88%9D%E5%A7%8B%E5%8C%96%E4%B8%8E%E8%87%AA%E5%8A%A8%E5%8C%96%E6%B5%8B%E8%AF%95.md)。
开发分工和本地调试说明见 [开发与测试指南](./doc/%E5%BC%80%E5%8F%91%E4%B8%8E%E6%B5%8B%E8%AF%95%E6%8C%87%E5%8D%97.md)。

### 本地联调

- 前端默认代理 `/api`、`/files` 到 `http://localhost:18080`
- 后端 App 入口：`tools/chatbi-app-server`
- 如需改目标地址：
  - PowerShell: `$env:VITE_API_TARGET='http://localhost:18080'; npm run dev`
- `localexample/` 现在仅保留为离线种子数据与样例参考，不再作为主联调通道

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
