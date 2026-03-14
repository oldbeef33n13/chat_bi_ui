# AI CLI 详细命令规范

## 1. 目标

AI CLI 的目标，不是简单提供几个开发命令，而是为 `chatbi-ai-service` 提供一套统一的离线调用和评测入口。

它需要同时满足：

- 单条样例回放
- 直接调用单个 scene
- 批量评测
- 指定 provider
- 指定 prompt version
- 输出结构化结果

CLI 的价值主要在于：

- 调试 prompt
- 快速复现问题
- 跑批量回归
- 支撑 CI

---

## 2. 设计原则

### 2.1 CLI 是 AI 服务的一级入口

CLI 不应被视为附属工具，而应视为与 HTTP API 同等级的入口。

原因：

- AI 能力本质上应该可脱离前端单独使用
- 调试和评测更适合命令行

### 2.2 命令语义优先于实现细节

CLI 命令应围绕 scene 和评测任务设计，而不是围绕内部 Python 模块设计。

例如：

- `command-plan`
- `chart-recommend`
- `chart-ask`
- `data-guide`
- `story-summary`
- `eval`

而不是：

- `run-service-x`
- `call-internal-provider`

### 2.3 输出默认标准 JSON

CLI 最重要的是可被后续脚本和 CI 消费，所以默认输出应是：

- 标准 JSON

同时支持：

- pretty 输出
- markdown report

---

## 3. 总体命令结构

建议统一入口：

```bash
python -m app.cli <command> [options]
```

第一阶段建议命令集合：

- `command-plan`
- `chart-recommend`
- `chart-ask`
- `data-guide`
- `story-summary`
- `eval`
- `capabilities`

后续可扩：

- `benchmark`
- `prompt-list`
- `prompt-show`
- `prompt-compare`

---

## 4. 单 Scene 调用命令

## 4.1 `command-plan`

用途：

- 单次回放命令规划场景

示例：

```bash
python -m app.cli command-plan --input evals/command_plan/case_001.json
python -m app.cli command-plan --json "{\"input\":\"改成柱状图并开启标签\",\"currentNodeId\":\"chart_1\"}"
```

## 4.2 `chart-recommend`

示例：

```bash
python -m app.cli chart-recommend --input evals/chart_recommend/case_001.json
```

## 4.3 `chart-ask`

示例：

```bash
python -m app.cli chart-ask --input evals/chart_ask/case_001.json
```

## 4.4 `data-guide`

示例：

```bash
python -m app.cli data-guide --input evals/data_guide/case_001.json
```

## 4.5 `story-summary`

示例：

```bash
python -m app.cli story-summary --input evals/story_summary/case_001.json
```

---

## 5. `eval` 命令

## 5.1 用途

批量跑样例并汇总评分。

## 5.2 推荐用法

```bash
python -m app.cli eval --scene chart_recommend
python -m app.cli eval --scene chart_recommend --provider rule
python -m app.cli eval --all
```

## 5.3 可选过滤

建议支持：

- `--scene`
- `--tag`
- `--provider`
- `--prompt-version`
- `--limit`

---

## 6. 输入方式规范

CLI 应统一支持三种输入方式。

## 6.1 文件输入

最推荐方式：

```bash
python -m app.cli chart-recommend --input evals/chart_recommend/case_001.json
```

优点：

- 易回放
- 易分享
- 易纳入样例集

## 6.2 JSON 字符串输入

适合快速调试：

```bash
python -m app.cli command-plan --json "{\"input\":\"改成柱状图\",\"currentNodeId\":\"chart_1\"}"
```

## 6.3 stdin 输入

适合脚本和管道：

```bash
type case.json | python -m app.cli chart-recommend --stdin
```

建议优先级：

- `--input`
- `--json`
- `--stdin`

同一命令中只允许一种输入方式生效。

---

## 7. 输出方式规范

## 7.1 默认输出

默认输出：

- 紧凑 JSON

适合：

- 脚本处理
- CI

## 7.2 `--pretty`

输出格式化 JSON：

```bash
python -m app.cli chart-recommend --input case.json --pretty
```

## 7.3 `--report markdown`

适合 `eval` 输出简易人工可读报告：

```bash
python -m app.cli eval --scene chart_recommend --report markdown
```

## 7.4 `--output`

支持输出到文件：

```bash
python -m app.cli eval --scene chart_recommend --output reports/chart_recommend.json
```

---

## 8. Provider 与 Prompt 参数

建议所有 scene 命令都支持：

- `--provider`
- `--prompt-version`

示例：

```bash
python -m app.cli chart-recommend --input case.json --provider openai_compatible --prompt-version v2
```

说明：

- `provider` 用于覆盖默认运行模式
- `prompt-version` 用于强制使用某个 prompt 版本

这两项是后续评估对比的基础。

---

## 9. 命令返回结构建议

## 9.1 Scene 命令返回

建议统一返回：

```json
{
  "scene": "chart_recommend",
  "provider": "rule",
  "promptVersion": "v2",
  "inputId": "chart_recommend_basic_001",
  "result": {},
  "meta": {
    "latencyMs": 10,
    "fallbackUsed": true
  }
}
```

## 9.2 `eval` 返回

建议统一返回：

```json
{
  "scene": "chart_recommend",
  "provider": "rule",
  "promptVersion": "v2",
  "caseCount": 50,
  "passCount": 46,
  "passRate": 0.92,
  "avgLatencyMs": 12,
  "fallbackRate": 1.0,
  "cases": []
}
```

---

## 10. 错误处理规范

CLI 出错时应有明确区分：

### 10.1 输入错误

例如：

- 文件不存在
- JSON 非法
- scene 不匹配

### 10.2 服务错误

例如：

- provider 调用失败
- 输出解析失败

### 10.3 评测错误

例如：

- 样例缺失 `expect`
- 评分器找不到

建议：

- 终端输出简短错误
- `--verbose` 时输出堆栈

---

## 11. 推荐子命令清单

第一阶段建议只做这些：

- `capabilities`
- `command-plan`
- `chart-recommend`
- `chart-ask`
- `data-guide`
- `story-summary`
- `eval`

第二阶段再做：

- `benchmark`
- `prompt-list`
- `prompt-show`
- `prompt-compare`

---

## 12. 参考使用流程

## 12.1 开发 prompt

```bash
python -m app.cli chart-recommend --input evals/chart_recommend/case_001.json --pretty
```

## 12.2 回放失败案例

```bash
python -m app.cli chart-ask --input evals/chart_ask/case_013.json --pretty
```

## 12.3 批量评估

```bash
python -m app.cli eval --scene chart_recommend --report markdown
```

## 12.4 对比 provider

```bash
python -m app.cli eval --scene chart_recommend --provider rule
python -m app.cli eval --scene chart_recommend --provider openai_compatible
```

---

## 13. 当前结论

CLI 的本质不是“命令行版 HTTP”，而是 AI 服务的开发基础设施。

它要承担：

- 调试入口
- 回放入口
- 评测入口
- 对比入口

所以 CLI 的结构应该在实现前就先定清楚。
