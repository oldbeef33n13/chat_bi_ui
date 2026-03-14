# AI Eval 与 CLI 规范

## 1. 目标

AI 服务要成为独立能力中心，就必须具备：

- 可回放
- 可评估
- 可比较
- 可命令行直接使用

因此需要两套配套能力：

- `Eval Harness`
- `CLI Runner`

---

## 2. Eval 的目标

Eval 不是为了做复杂学术评分，而是为了回答这几个很实际的问题：

- 这个 scene 现在还稳定吗
- 换了 prompt 后有没有变好
- 换了 provider 后有没有退化
- fallback 是否还能兜住

---

## 3. Eval 评估对象

建议优先覆盖当前 5 个 scene：

- `command_plan`
- `chart_recommend`
- `chart_ask`
- `data_guide`
- `story_summary`

每个 scene 都要有自己的样例集和最小评分规则。

---

## 4. Eval 目录建议

建议目录：

```text
tools/chatbi-ai-service/
  app/
    core/
      eval/
        runner.py
        reporter.py
        scoring.py
  evals/
    command_plan/
      cases/
      expected/
    chart_recommend/
      cases/
      expected/
    chart_ask/
      cases/
      expected/
    data_guide/
      cases/
      expected/
    story_summary/
      cases/
      expected/
```

更轻量的第一版也可以直接做成：

```text
tools/chatbi-ai-service/
  evals/
    command_plan/
      case_01.json
    chart_recommend/
      case_01.json
```

---

## 5. 样例格式建议

建议每个样例至少包含：

```json
{
  "id": "chart_recommend_01",
  "scene": "chart_recommend",
  "description": "时间字段 + 单指标，应该推荐趋势图",
  "input": {
    "requestedType": "auto",
    "fields": [
      { "name": "stat_date", "label": "统计日期", "type": "time" },
      { "name": "alarm_count", "label": "告警数", "type": "number" }
    ],
    "context": {
      "docType": "dashboard",
      "trigger": "inspector"
    }
  },
  "expect": {
    "chartTypeIn": ["line", "combo"],
    "mustHaveRoles": ["x", "y"]
  }
}
```

---

## 6. 评分规则建议

建议第一阶段先做“结构 + 关键字段”评分，不做过度复杂的主观评分。

## 6.1 通用评分项

- 输出是否结构合法
- 必填字段是否齐全
- 是否触发 fallback
- provider 调用是否成功
- 响应时延

## 6.2 Scene 专属评分项

### command_plan

- 是否有 `plan`
- 是否有 `targets`
- 是否有 `commands`

### chart_recommend

- `chartType` 是否命中预期集合
- `bindings` 是否包含核心 role

### chart_ask

- 是否有 `answer`
- 是否有建议追问
- 若用户要求改图，是否生成 plan

### data_guide

- 是否有字段说明
- 是否有推荐图类型

### story_summary

- 是否有 headline / conclusion / evidence / advice

---

## 7. Benchmark 输出建议

Eval 结果建议最终形成一份结构化报告：

```json
{
  "scene": "chart_recommend",
  "provider": "openai_compatible",
  "promptVersion": "v2",
  "caseCount": 20,
  "passCount": 18,
  "fallbackCount": 2,
  "avgLatencyMs": 1320
}
```

建议后续再输出 markdown 汇总，便于人工阅读。

---

## 8. CLI 的目标

CLI 不是可选项，而是 AI 服务开发效率的重要保证。

CLI 应至少满足：

- 单条样例回放
- 指定 scene 调用
- 指定 provider
- 指定 prompt version
- 输出原始 JSON

---

## 9. CLI 设计建议

建议后续统一入口：

```bash
python -m app.cli <command>
```

推荐命令：

### 9.1 单次调用

```bash
python -m app.cli command-plan --input evals/command_plan/case_01.json
python -m app.cli chart-recommend --input evals/chart_recommend/case_01.json
python -m app.cli chart-ask --input evals/chart_ask/case_01.json
```

### 9.2 批量评估

```bash
python -m app.cli eval --scene chart_recommend
python -m app.cli eval --scene story_summary --provider openai_compatible
python -m app.cli eval --all
```

### 9.3 Prompt 指定

```bash
python -m app.cli chart-recommend --input case.json --prompt-version v2
```

---

## 10. CLI 输入输出原则

### 输入

- 优先文件输入
- 支持 `stdin`
- 支持直接传 JSON string

### 输出

- 默认标准 JSON
- 可加 `--pretty`
- 可加 `--report markdown`

---

## 11. 推荐实施顺序

建议按下面顺序做：

1. 每个 scene 先准备 `examples / eval cases`
2. 做 `app.cli`
3. 做 `eval runner`
4. 做 `score + report`
5. 再接 prompt version compare

---

## 12. 与前端接入的关系

Eval 和 CLI 应在前端接入之前先做好基础版。

原因很直接：

- scene 是否稳定，应先在独立环境验证
- prompt 是否有效，应先脱离页面验证
- provider 是否稳定，应先在批量样例里验证

否则前端接入后很难定位问题是：

- prompt 不行
- provider 不稳
- 还是 UI 链路问题

---

## 13. 当前结论

AI 服务如果没有 Eval 和 CLI，很容易退化成“只能在页面里试”的黑箱系统。

所以这两块不应该被视为后补工具，而应视为：

- 开发基础设施
- 质量基础设施
- 迭代基础设施
