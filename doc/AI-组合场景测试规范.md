# AI 组合场景测试规范

## 1. 目标

本规范用于定义 ChatBI AI 组合层的测试方式。

这里的“组合场景”不是单个 scene 的原子测试，而是多个能力串起来后的测试：

- 对话路由
- 对象定位
- 分析计划生成
- 安全执行
- 结果总结
- 修改建议

目标是让后续实现不只“能跑”，而是能够验证：

- 路由是否正确
- 对象是否命中
- 分析计划是否合理
- 执行结果是否正确
- 总结是否 grounded
- 多轮上下文是否延续

---

## 2. 为什么必须先做组合测试

单 scene eval 只能说明：

- `chart_recommend` 单独可用
- `command_plan` 单独可用
- `story_summary` 单独可用

但不能说明：

- 一句话进来是否会路由到正确 scene
- “这个图 / 那天 / 第二章” 是否能正确定位对象
- 大数据分析链路是否真的可闭环
- 多轮对话上下文是否稳定

因此在进入组合层编码前，必须先补组合场景用例。

---

## 3. 测试层次

建议分 4 层。

## 3.1 Router Case

验证：

- 用户问题会被识别成什么意图
- 命中了哪个对象
- 是否需要追问

适合问题：

- “这个图最高点是什么时候”
- “把第二章改成先结论再图表”
- “帮我分析华东区域近7天为什么波动这么大”

## 3.2 Planner Case

验证：

- 给定问题、schema、profile、sample 后
- `Analysis Plan DSL` 是否合理

重点断言：

- `analysisMode`
- 使用了哪些 source
- 使用了哪些算子
- 是否出现非法 join/agg

## 3.3 Executor Case

验证：

- 固定 plan + 固定输入数据
- 最终结果是否正确

这是最确定、最刚性的测试层。

## 3.4 Conversation E2E Case

验证：

- 多轮对话是否能串起来
- 对象是否能延续
- scene 是否能切换
- 最终输出是否符合预期

---

## 4. 目录结构建议

建议目录：

```text
tools/chatbi-ai-service/
  evals/
    composed/
      router/
      analysis_pipeline/
      multi_source/
      conversation/
      README.md
```

说明：

- `router`
  只测路由与对象定位
- `analysis_pipeline`
  测 `planner -> executor -> summary`
- `multi_source`
  测多源 compare / join
- `conversation`
  测多轮上下文

---

## 5. 单条组合 case 结构

建议每条 case 仍然使用 JSON。

统一结构建议：

```json
{
  "id": "composed_analysis_pipeline_001",
  "scene": "composed",
  "flowType": "analysis_pipeline",
  "title": "单源大数据分析闭环",
  "description": "分析华东区域近7天告警波动原因",
  "tags": ["analysis", "single-source", "ops"],
  "input": {},
  "expect": {},
  "score": {},
  "notes": "用于组合层基础闭环验证"
}
```

字段：

- `id`
- `scene`
  固定 `composed`
- `flowType`
  `router | analysis_pipeline | multi_source | conversation`
- `title`
- `description`
- `tags`
- `input`
- `expect`
- `score`
- `notes`

---

## 6. Router Case 结构

```json
{
  "id": "composed_router_001",
  "scene": "composed",
  "flowType": "router",
  "input": {
    "thread": {
      "threadId": "thread_001",
      "docId": "tpl_001",
      "docType": "report",
      "activeSectionId": "section_2",
      "selectedObjectIds": ["chart_1"]
    },
    "objectRegistry": {},
    "userText": "这个图最高点是什么时候"
  },
  "expect": {
    "router": {
      "intent": "ask_chart",
      "scene": "chart_ask",
      "resolvedObjectIds": ["chart_1"],
      "needsClarification": false
    }
  }
}
```

---

## 7. Analysis Pipeline Case 结构

```json
{
  "id": "composed_analysis_pipeline_001",
  "scene": "composed",
  "flowType": "analysis_pipeline",
  "input": {
    "userQuestion": "分析华东区域近7天告警为什么波动这么大",
    "plannerInput": {},
    "executorFixtures": {},
    "summaryInput": {}
  },
  "expect": {
    "router": {
      "intent": "ask_analysis",
      "scene": "analysis_planner"
    },
    "plan": {
      "analysisMode": "single_source",
      "mustUseSources": ["ops_alarm_trend"],
      "mustContainOps": ["filter_rows", "group_aggregate", "sort_rows"],
      "mustNotContainOps": ["join_sources"]
    },
    "execution": {
      "status": "succeeded",
      "mustHaveTables": ["summary_table"]
    },
    "summary": {
      "mustHaveFields": ["headline", "conclusion", "evidence", "advice"],
      "mustMentionAny": ["华东", "告警", "峰值"]
    }
  }
}
```

---

## 8. Multi-source Case 结构

```json
{
  "id": "composed_multi_source_001",
  "scene": "composed",
  "flowType": "multi_source",
  "input": {
    "userQuestion": "告警上升和工单量有没有关系",
    "plannerInput": {}
  },
  "expect": {
    "plan": {
      "analysisModeIn": ["multi_source_compare", "multi_source_join"],
      "mustUseSources": ["ops_alarm_trend", "ops_ticket_summary"]
    }
  }
}
```

需要额外断言：

- 不允许自由 join
- 如出现 `join_sources`，必须命中允许的 key

---

## 9. Conversation Case 结构

多轮 case 建议这样表示：

```json
{
  "id": "composed_conversation_001",
  "scene": "composed",
  "flowType": "conversation",
  "input": {
    "threadSeed": {},
    "turns": [
      { "userText": "这个图最高点是什么时候" },
      { "userText": "为什么那天这么高" },
      { "userText": "那把它改成柱状图" },
      { "userText": "再补一句管理层结论" }
    ]
  },
  "expect": {
    "turns": [
      { "intent": "ask_chart", "resolvedObjectIds": ["chart_1"] },
      { "intent": "ask_analysis", "resolvedObjectIds": ["chart_1"] },
      { "intent": "ask_edit", "resolvedObjectIds": ["chart_1"] },
      { "intent": "ask_doc_summary", "resolvedObjectIds": ["chart_1"] }
    ]
  }
}
```

---

## 10. 评分建议

组合 case 建议拆阶段评分。

推荐结构：

```json
{
  "weights": {
    "router": 0.2,
    "planning": 0.3,
    "execution": 0.3,
    "summary": 0.2
  },
  "minimumPassScore": 0.8
}
```

如果是纯 router case：

```json
{
  "weights": {
    "router": 1.0
  },
  "minimumPassScore": 0.9
}
```

---

## 11. 首批建议覆盖范围

建议第一批至少补：

- `router`: 4 条
- `analysis_pipeline`: 4 条
- `multi_source`: 4 条
- `conversation`: 4 条

合计建议首批：

- `16` 条

---

## 12. 首批重点场景

### 12.1 单源大数据分析

- 用户问题：华东区域近7天告警波动原因
- 数据源：`ops_alarm_trend`
- 验证：
  - 走 `ask_analysis`
  - planner 用单源
  - executor 能产出峰值结果
  - summary grounded

### 12.2 多源对比分析

- 用户问题：告警上升和工单量有没有关系
- 数据源：
  - `ops_alarm_trend`
  - `ops_ticket_summary`
- 验证：
  - 优先 compare
  - 如 join 必须受控

### 12.3 混合对话

- 用户先问图，再问原因，再提修改，再要总结
- 验证：
  - 对象不丢
  - intent 切换正确
  - thread context 延续

### 12.4 文档级修改

- 用户：把第二章改成先结论再图表
- 验证：
  - `ask_edit`
  - 命中 `section_2`
  - 输出修改计划而不是直接改数据

---

## 13. 落地顺序

建议：

1. 先补组合 case 文档
2. 先补 `composed/` 样例骨架
3. 再补组合 runner
4. 再实现 router/planner/executor 组合层

---

## 14. 当前结论

ChatBI 下一步要做的是“AI 组合层”，不是继续扩单个 scene。

因此测试也必须从“单点场景”升级到“组合场景”。

先把组合 case 定义清楚，再编码，会明显更稳。
