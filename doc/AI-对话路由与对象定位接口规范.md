# AI 对话路由与对象定位接口规范

## 1. 目标

本规范定义 ChatBI 统一 AI 对话入口中的三层能力接口：

- `conversation router`
- `object registry`
- `memory store`

目标是让系统能在同一线程里稳定处理：

- 问数据
- 问图表
- 问文档总结
- 问怎么修改
- 问怎么生成

---

## 2. 总体流程

每轮对话建议固定走这 5 步：

1. 读取 `thread context`
2. 识别用户意图
3. 定位目标对象
4. 组装最小上下文
5. 路由到具体 scene

统一表达：

`user turn -> router -> grounding -> memory -> scene`

---

## 3. Router 输入协议

## 3.1 Request

```json
{
  "threadId": "thread_001",
  "docId": "tpl_001",
  "docType": "report",
  "userText": "把这个图改成柱状图并加一句结论",
  "selectedObjectIds": ["chart_1"],
  "activeSectionId": "section_2",
  "activePageId": null,
  "templateVariables": {
    "region": "华东",
    "from": "2026-03-01",
    "to": "2026-03-07"
  }
}
```

字段：

- `threadId`
- `docId`
- `docType`
  - `dashboard | report | ppt`
- `userText`
- `selectedObjectIds`
- `activeSectionId`
- `activePageId`
- `templateVariables`

---

## 4. Router 输出协议

## 4.1 Success

```json
{
  "intent": "ask_edit",
  "scene": "command_plan",
  "resolvedObjects": [
    {
      "objectId": "chart_1",
      "kind": "chart",
      "confidence": 0.98
    }
  ],
  "needsClarification": false,
  "workingContext": {
    "docId": "tpl_001",
    "docType": "report",
    "selectedObjectIds": ["chart_1"],
    "lastResolvedObjectId": "chart_1"
  }
}
```

## 4.2 Clarification

```json
{
  "intent": "ask_chart",
  "scene": null,
  "resolvedObjects": [],
  "needsClarification": true,
  "clarificationQuestion": "你说的是第二章的告警趋势图，还是容量利用率图？"
}
```

---

## 5. Intent 枚举

第一阶段只支持：

- `ask_data`
- `ask_chart`
- `ask_doc_summary`
- `ask_edit`
- `ask_generate`
- `ask_analysis`

scene 映射建议：

- `ask_data -> data_guide`
- `ask_chart -> chart_ask`
- `ask_doc_summary -> story_summary`
- `ask_edit -> command_plan`
- `ask_generate -> command_plan | story_summary`
- `ask_analysis -> analysis_planner`

---

## 6. Object Registry 协议

## 6.1 目标

Object Registry 是“文档内所有可被指代对象”的统一索引。

它不是前端渲染树原样复制，而是给 AI 定位用的轻量摘要。

## 6.2 顶层结构

```json
{
  "docId": "tpl_001",
  "docType": "report",
  "objects": []
}
```

## 6.3 Object 结构

```json
{
  "objectId": "chart_1",
  "kind": "chart",
  "title": "区域告警趋势",
  "pageId": null,
  "sectionId": "section_2",
  "chartType": "line",
  "fieldKeywords": ["告警", "趋势", "区域", "日期"],
  "sourceRefs": ["ops_alarm_trend"],
  "displayText": "第二章 区域告警趋势 折线图"
}
```

字段说明：

- `objectId`
- `kind`
  - `doc | section | slide | chart | table | text | image`
- `title`
- `pageId`
- `sectionId`
- `chartType`
- `fieldKeywords`
- `sourceRefs`
- `displayText`

---

## 7. 对象定位算法

建议按固定优先级：

1. `selectedObjectIds`
2. 当前激活容器
   - `activeSectionId`
   - `activePageId`
3. 最近一次命中的 `lastResolvedObjectId`
4. 对 `displayText/title/fieldKeywords` 做文本匹配
5. 仍歧义则发 clarification

### 7.1 文本匹配最低要求

建议支持：

- 标题精确匹配
- 中文关键词包含
- “上一页 / 第二章 / 当前图 / 这个图” 这类指代词

### 7.2 第一阶段不要求

- 深度语义检索
- 跨语言 embedding 检索
- 模型自由 grounding

---

## 8. Working Memory 协议

## 8.1 结构

```json
{
  "threadId": "thread_001",
  "docId": "tpl_001",
  "docType": "report",
  "activePageId": null,
  "activeSectionId": "section_2",
  "selectedObjectIds": ["chart_1"],
  "lastResolvedObjectId": "chart_1",
  "currentIntent": "ask_chart",
  "activeTaskType": "report_analysis",
  "activeTaskTarget": "section_2",
  "templateVariables": {
    "region": "华东",
    "from": "2026-03-01",
    "to": "2026-03-07"
  }
}
```

## 8.2 存储建议

第一阶段建议：

- 内存字典
- 或本地 JSON cache

键：

- `threadId`

过期策略：

- 30 分钟无访问过期

---

## 9. Episodic Memory 协议

## 9.1 结构

```json
{
  "threadId": "thread_001",
  "turnId": "turn_008",
  "intent": "ask_edit",
  "scene": "command_plan",
  "resolvedObjectIds": ["chart_1"],
  "userText": "把这个图改成柱状图",
  "assistantSummary": "建议将当前折线图切换为柱状图",
  "accepted": true,
  "createdAt": "2026-03-11T10:00:00+08:00"
}
```

## 9.2 SQLite 表建议

表名：

- `ai_thread_turn`

字段建议：

- `thread_id`
- `turn_id`
- `doc_id`
- `intent`
- `scene`
- `resolved_objects_json`
- `user_text`
- `assistant_summary`
- `accepted`
- `created_at`

---

## 10. Semantic Memory 协议

Semantic Memory 保存稳定、可复用的结构化知识。

建议拆三类：

- `object_index`
- `data_source_index`
- `user_preference_index`

### 10.1 第一阶段推荐存储

- SQLite
- 可选 `OpenSearch`

### 10.2 OpenSearch 可选用途

仅建议用于：

- object 摘要检索
- 历史摘要检索
- 数据源说明检索

不建议第一阶段把它做成主事务存储。

---

## 11. Markdown 归档协议

Markdown 不是运行态主存储，只是辅助归档。

建议按线程周期性输出：

- `thread-summary.md`
- `analysis-notes.md`

建议内容：

- 关键问题
- 已解析对象
- 已执行分析
- 关键结论
- 待确认问题

---

## 12. Prompt 上下文最小装配

每次 scene 调用时，建议只装配：

- 当前 `userText`
- 当前 `intent`
- 当前命中对象摘要
- 当前变量
- 最近 `1~3` 条相关 turn 摘要
- 必要的数据/结果摘要

不应装配：

- 整份文档全部 DSL
- 全量对话历史
- 全量对象注册表
- 全量 rows

---

## 13. Router API 建议

如果后续要独立成 HTTP 接口，建议最小接口：

### 13.1 `POST /api/v1/ai/conversation/route`

输入：

- Router Request

输出：

- Router Response

### 13.2 `POST /api/v1/ai/conversation/object-registry/build`

输入：

- `docId`
- `docType`
- `snapshotDsl`

输出：

- `ObjectRegistry`

### 13.3 `POST /api/v1/ai/conversation/thread/{threadId}/summarize`

输入：

- `threadId`

输出：

- Markdown 或结构化 thread summary

第一阶段如果不想暴露 HTTP，也可以只做内部 service。

---

## 14. 典型路由示例

## 14.1 图表追问

用户输入：

- “这个图最高点是什么时候”

路由结果：

- `intent = ask_chart`
- `scene = chart_ask`
- `resolvedObjects = [chart_1]`

## 14.2 文档修改

用户输入：

- “把第二章改成先结论再图表”

路由结果：

- `intent = ask_edit`
- `scene = command_plan`
- `resolvedObjects = [section_2]`

## 14.3 深度分析

用户输入：

- “帮我分析华东区域过去7天为什么波动这么大”

路由结果：

- `intent = ask_analysis`
- `scene = analysis_planner`
- `resolvedObjects = [chart_1]` 或当前 section

---

## 15. 错误码建议

- `ROUTER_THREAD_NOT_FOUND`
- `ROUTER_DOC_NOT_FOUND`
- `ROUTER_OBJECT_NOT_FOUND`
- `ROUTER_AMBIGUOUS_OBJECT`
- `ROUTER_UNSUPPORTED_INTENT`
- `ROUTER_CONTEXT_TOO_LARGE`
- `ROUTER_MEMORY_LOAD_FAILED`

---

## 16. 首批实现范围

第一阶段建议只实现：

- `intent classifier`
- `object registry builder`
- `rule-first object resolver`
- `working memory`
- `episodic memory`

第二阶段再补：

- `OpenSearch recall`
- `Markdown 周期性归档`
- `thread summary 压缩`

---

## 17. 当前结论

统一对话入口的关键不是一个超级 prompt，而是：

- 先分类
- 再定位对象
- 再读取最小记忆
- 最后路由到现有原子能力

对 ChatBI 当前阶段来说，这套结构完全可以用轻量技术栈实现：

- Python service
- SQLite
- JSON
- 可选 OpenSearch

不需要先上重型记忆框架。
