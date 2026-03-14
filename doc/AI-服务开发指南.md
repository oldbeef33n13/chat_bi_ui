# AI 服务开发指南

## 1. 文档目标

这份文档单独说明 `tools/chatbi-ai-service` 的开发方式，目标是：

- 新同学能快速启动 AI 服务
- 能快速添加一个新的 scene
- 能清楚知道本地模型配置怎么放
- 能知道测试和后续扩展的标准方式

---

## 2. 目录说明

当前目录结构：

```text
tools/chatbi-ai-service/
  app/
    core/
    scenes/
    main.py
    models.py
  tests/
  pyproject.toml
  README.md
```

### `app/core`

负责公共基础设施：

- 配置
- env 加载
- llm client
- preprocess / postprocess
- 共享语义
- container

### `app/scenes`

按场景组织独立能力：

- `command_plan`
- `chart_recommend`
- `chart_ask`
- `data_guide`
- `story_summary`

### `tests`

当前是 API 层基础回归，后续应继续补：

- scene 单测
- provider mock 测试
- eval 样例测试

---

## 3. 本地启动

推荐走统一脚本初始化：

```bash
npm run stack:init
```

初始化完成后，单独启动 AI 服务：

```bash
npm run ai:dev
```

默认端口：

- `18180`

健康检查：

- `http://127.0.0.1:18180/health`

能力清单：

- `http://127.0.0.1:18180/api/v1/ai/capabilities`

---

## 4. 本地配置

推荐把模型配置放在以下任一位置：

- `.runtime/ai.env`
- `tools/chatbi-ai-service/.env.local`

示例可参考：

- `tools/chatbi-ai-service/.env.example`

典型内容：

```env
CHATBI_AI_PROVIDER=openai_compatible
CHATBI_OPENAI_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
CHATBI_OPENAI_API_KEY=replace-with-your-key
CHATBI_OPENAI_MODEL=qwen-plus
```

注意：

- 这些文件不应提交到仓库
- CI 也不应依赖本地文件，CI 推荐走环境变量

---

## 5. 当前可用接口

### 5.1 健康检查

- `GET /health`

### 5.2 能力清单

- `GET /api/v1/ai/capabilities`

### 5.3 命令规划

- `POST /api/v1/ai/command-plan`

### 5.4 图表推荐

- `POST /api/v1/ai/chart/recommend`

### 5.5 图表问答

- `POST /api/v1/ai/chart/ask`

### 5.6 数据说明

- `POST /api/v1/ai/data/guide`

### 5.7 数据故事摘要

- `POST /api/v1/ai/story/summary`

---

## 6. 测试方式

运行 AI 服务测试：

```bash
npm run test:ai
```

当前测试特点：

- 测试时强制 `CHATBI_AI_PROVIDER=rule`
- 不依赖真实模型
- 主要验证 API contract 与 fallback 行为

这样可以保证：

- CI 稳定
- 本地离线可测
- 不受模型波动影响

---

## 7. 如何新增一个 scene

假设要新增 `layout_suggest`。

推荐步骤：

1. 在 `app/scenes/layout_suggest/` 下创建：
   - `__init__.py`
   - `prompt.py`
   - `service.py`
2. 在 `app/models.py` 增加 request/response model
3. 在 `app/core/container.py` 装配 scene
4. 在 `app/main.py` 增加路由
5. 在 `tests/` 补 API 回归

### 设计要求

- scene 必须先定义结构化输出
- scene 必须有 fallback
- prompt 不要直接写进 `main.py` 或 container
- service 不要直接处理 HTTP 细节

---

## 8. Scene 开发规范

## 8.1 输入设计

每个 scene 的输入要尽量“业务语义化”，不要直接传原始页面 UI 状态。

例如：

- 图表推荐传：
  - 字段 schema
  - 当前图类型
  - 当前绑定
  - 文档场景

而不要传一整份巨大的前端组件状态。

## 8.2 输出设计

每个 scene 输出必须：

- 有固定结构
- 尽量可直接校验
- 尽量可直接被上层消费

例如：

- 推荐图类型
- 字段绑定建议
- 结论
- 证据
- 建议

而不是大段无约束自由文本。

## 8.3 fallback 设计

scene 必须具备规则兜底，原因：

- 本地演示
- 本地开发
- CI 回归
- provider 故障保护

---

## 9. Prompt 编写建议

每个 prompt 应明确 4 件事：

1. 角色
2. 输入上下文
3. 输出 JSON 结构
4. 边界与限制

例如：

- 只输出 JSON
- 使用中文
- 不要输出 markdown
- 如果无法判断，则返回保守结果

后续建议将 prompt 版本化，形成独立的 prompt registry。

---

## 10. 共享能力应该放哪里

### 应该放 `core/pipeline`

- 字段角色推断
- 聚合口径推断
- sample rows 截断
- JSON 清洗

### 不应该放 `core`

- 某个具体场景的 prompt
- 某个场景独有的业务逻辑

这些应该继续留在各自的 scene 中。

---

## 11. 后续建议补齐

建议下一阶段优先补：

### 11.1 prompt registry

- prompt 版本管理
- prompt 变更记录
- scene 级 prompt 查询

### 11.2 eval harness

- 固定样例输入
- 固定期望输出
- 一键跑评估

### 11.3 CLI runner

- 命令行直接调用 scene
- 支持样例回放
- 支持批量评估

### 11.4 scene examples

每个 scene 建议单独建：

- `examples/`
- `eval/`

---

## 12. 推荐开发流程

日常开发推荐流程：

1. `npm run stack:init`
2. `npm run ai:dev`
3. `npm run test:ai`
4. 如需联调整体：
   - `npm run stack:dev`

如果改动涉及 API contract 或 prompt 输出结构，建议同时补：

- scene 样例
- API 回归
- 文档说明

---

## 13. 当前结论

`chatbi-ai-service` 当前最重要的不是立刻接前端，而是先成为一个成熟的独立能力服务：

- 结构清楚
- 开发清楚
- 测试清楚
- 扩展清楚

这套基础打稳后，再进入前端接入会更稳。
