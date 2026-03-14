# AI 服务架构与功能设计

## 1. 目标

`chatbi-ai-service` 的定位不是一个“给前端页面调用的小工具服务”，而是整个 ChatBI 的独立智能能力中心。

它需要同时满足：

- 能被前端调用
- 能被 Java 后端调用
- 能被定时任务调用
- 能被离线评估脚本调用
- 能被命令行单独调试

核心目标：

- 承载大模型能力
- 统一 AI 能力接口
- 统一 prompt 管理
- 统一回退策略
- 统一评估与回归

---

## 2. 设计原则

## 2.1 服务定位

AI 服务优先做“独立能力中心”，而不是“前端附属模块”。

因此设计上应满足：

- 独立部署
- 独立测试
- 独立演进
- 独立评估

## 2.2 能力组织原则

能力按 `scene` 组织，而不是按页面组织。

例如：

- `chart_recommend`
- `chart_ask`
- `command_plan`
- `data_guide`
- `story_summary`

而不是：

- dashboard_ai
- report_ai
- ppt_ai

原因是同一能力会被多个场景复用。

## 2.3 模型策略

默认策略不是“纯模型输出”，而是：

`provider output + structured validation + fallback`

也就是：

- 优先调用大模型
- 对输出做结构化校验
- 模型失败时回退到稳定规则

这样才能保证：

- 本地可用
- 演示可用
- 测试可用
- 线上更稳

## 2.4 风险控制

- 所有 AI 输出优先是结构化结果
- 不允许直接生成不可控自由执行链
- 高风险修改必须通过上层确认
- Scene 自己不负责直接写数据库或直接改前端状态

---

## 3. 当前目标能力范围

第一阶段只聚焦 5 个独立能力：

1. `command_plan`
2. `chart_recommend`
3. `chart_ask`
4. `data_guide`
5. `story_summary`

这是最小闭环能力集，足以支撑后续：

- 图表推荐
- 图表问答
- 报告摘要
- 智能解释
- 自然语言编辑意图转计划

---

## 4. 总体架构

## 4.1 分层结构

```text
tools/chatbi-ai-service/
  app/
    core/
      settings.py
      env.py
      container.py
      llm/
      pipeline/
    scenes/
      command_plan/
      chart_recommend/
      chart_ask/
      data_guide/
      story_summary/
    models.py
    main.py
  tests/
```

## 4.2 分层职责

### `core`

负责基础设施和洋葱模型外围能力：

- provider 配置
- 本地 env 加载
- 模型客户端
- 共享语义推断
- preprocess / postprocess
- 容器与依赖注入

### `scenes`

按独立能力组织，每个场景单独维护：

- prompt
- fallback
- service
- scene contract 的处理逻辑

### `models`

统一定义外部 API contract。

### `main`

只负责 API 路由装配，不放业务判断。

---

## 5. Scene 设计规范

每个 `scene` 建议保持一致结构：

```text
scenes/<scene_name>/
  __init__.py
  prompt.py
  service.py
```

后续应继续扩展为：

```text
scenes/<scene_name>/
  __init__.py
  prompt.py
  service.py
  fallback.py
  examples/
  tests/
  eval/
```

## 5.1 prompt.py

负责：

- 系统提示词
- 输出 JSON 约束
- 场景边界说明

要求：

- 每个 scene 独立 prompt
- prompt 文本不散落在 service 里

## 5.2 service.py

负责：

- 组装 provider 请求
- 调用 llm
- 结果校验
- fallback 切换

要求：

- service 是 scene 的唯一业务入口
- 不直接依赖前端实现
- 不直接依赖 HTTP 细节

## 5.3 fallback.py

后续建议从 service 中进一步拆出。

负责：

- 规则兜底
- 演示模式
- provider 不可用时的稳定输出

---

## 6. Core 设计规范

## 6.1 settings

统一读取：

- 环境变量
- `.runtime/ai.env`
- `tools/chatbi-ai-service/.env.local`

要求：

- 密钥不进仓库
- 允许本地快速切 provider

## 6.2 llm client

当前先支持：

- `openai_compatible`

后续扩展：

- 原生 OpenAI
- DashScope SDK
- Azure OpenAI
- 内部网关

要求：

- llm client 只负责协议调用
- 不负责场景 prompt 逻辑

## 6.3 pipeline

共享能力建议都收在 `pipeline`：

- prompt 前置裁剪
- sample rows 截断
- schema 简化
- 结构化 JSON 提取
- 图表语义推断

目标是：

- 避免 scene 之间复制粘贴
- 保持不同 scene 的语义一致

## 6.4 container

负责统一装配：

- settings
- llm client
- scene services

要求：

- 上层只依赖 `container.<scene>.handle(...)`
- 不直接在 `main.py` 创建实例

---

## 7. 能力 API 设计

## 7.1 command_plan

### 输入

- 用户自然语言意图
- 当前节点 ID
- 可选的节点树上下文

### 输出

- 结构化命令计划
- 推理说明

### 用途

- ChatBridge
- 智能编辑
- 批量改图/改文案

---

## 7.2 chart_recommend

### 输入

- 字段 schema
- 当前图类型
- 当前绑定
- 文档场景

### 输出

- 推荐图类型
- 推荐字段绑定
- 推荐理由

### 用途

- 图表配置面板
- 新建图表向导
- 自动选图

---

## 7.3 chart_ask

### 输入

- 图表 spec
- rows
- 用户问题

### 输出

- 分析结论
- 建议追问
- 可选改动计划

### 用途

- 图表智能问答
- 图表局部优化
- 图表一键改图

---

## 7.4 data_guide

### 输入

- 接口名称与说明
- 参数 schema
- 字段 schema
- 样例数据

### 输出

- 数据说明摘要
- 参数解释
- 字段解释
- 推荐图类型
- 关键洞察

### 用途

- 数据属性面板
- 数据接口管理
- 运行态说明

---

## 7.5 story_summary

### 输入

- 文档标题
- 文档类型
- 关键洞察
- 用户关注点

### 输出

- headline
- conclusion
- evidence
- advice

### 用途

- report 摘要
- ppt 汇报稿
- dashboard 总结

---

## 8. Provider 策略

## 8.1 当前策略

当前支持两种模式：

- `rule`
- `openai_compatible`

### `rule`

纯规则兜底：

- 本地可跑
- 测试稳定
- 无外部依赖

### `openai_compatible`

通过 OpenAI 协议兼容接口调用真实模型。

当前接入方式：

- 读取本地环境文件
- 调用 `/chat/completions`
- 解析 JSON 输出
- 若失败则回退规则

## 8.2 后续策略

后续建议增加：

- provider 能力探测
- provider 熔断
- provider 成本统计
- provider 结果缓存

---

## 9. Prompt 设计原则

Prompt 不应只是一段文本，而应具备：

- 场景边界
- 输入约束
- 输出 JSON 约束
- 风险边界

后续建议新增 `prompt registry`：

- 每个 scene 有版本号
- 可记录 prompt 更新历史
- 支持灰度对比和回归评估

建议目录：

```text
app/
  core/
    prompt_registry/
```

---

## 10. Eval 与回归设计

独立能力必须可评估。

建议后续补三层：

### 10.1 examples

每个 scene 固定样例输入。

### 10.2 eval

每个 scene 固定评估脚本，检查：

- 结构合法性
- 关键字段是否完整
- 是否命中预期类别

### 10.3 benchmark

批量输出：

- provider 成功率
- fallback 比例
- 平均响应时延
- 输出稳定性

---

## 11. CLI 设计

AI 服务不应只靠 HTTP 调试。  
建议补 CLI runner。

目标示例：

```bash
python -m app.cli command-plan --input examples/command_plan/case_01.json
python -m app.cli chart-recommend --input examples/chart_recommend/case_01.json
python -m app.cli chart-ask --input examples/chart_ask/case_01.json
```

用途：

- 本地调 prompt
- 回放样例
- 批量评估
- CI 校验

---

## 12. 安全要求

### 12.1 密钥管理

- API key 不允许入库
- 只允许通过环境变量或本地忽略文件传入

### 12.2 输出约束

- scene 输出优先结构化 JSON
- 禁止把自由文本直接当执行计划

### 12.3 审计

后续建议补：

- 请求 traceId
- provider 响应摘要
- fallback 原因
- 用户是否接受建议

---

## 13. 开发顺序建议

建议按以下顺序推进：

1. 先稳定 `core + scenes` 基础结构
2. 补 `prompt registry`
3. 补 `eval harness`
4. 补 `CLI runner`
5. 给每个 scene 加 `examples`
6. 再讨论前端正式接入

---

## 14. 当前结论

当前最合理的路线不是急着把 AI 接到所有页面，而是先把 Python AI 服务打造成：

- `独立能力中心`
- `可测试`
- `可评估`
- `可演进`

等这个中心稳定后，再逐步把前端、Java 后端、定时任务、展示态问答接进来。
