# AI 对话上下文与记忆规范

## 1. 目标

本规范用于定义 ChatBI 在“一个对话里既问数据、又问图表、又问修改、又问总结”场景下的上下文管理方案。

目标是解决：

- 如何识别用户当前在问哪个对象
- 如何在同一个线程里切换问答、修改、总结、生成
- 如何在轻量方案下保存记忆
- 如何避免把所有历史都硬塞进 prompt

---

## 2. 设计原则

### 2.1 先路由，再调用能力

每轮对话不应直接进入一个“大一统 prompt”。

建议先做：

- 意图分类
- 对象定位
- 上下文裁剪

再把请求路由到对应能力：

- `chart_ask`
- `data_guide`
- `story_summary`
- `command_plan`
- `analysis_planner`

### 2.2 记忆必须分层

不建议把全部对话历史和全部文档结构都持续塞进模型上下文。

建议分三层：

- `working memory`
- `episodic memory`
- `semantic memory`

### 2.3 Markdown 只做归档，不做主运行态

Markdown 适合：

- 人工阅读
- 导出归档

但运行态主记忆必须是结构化 JSON。

---

## 3. 统一对话入口的意图分类

建议每轮对话先分类到以下之一：

- `ask_data`
- `ask_chart`
- `ask_doc_summary`
- `ask_edit`
- `ask_generate`
- `ask_analysis`

### 3.1 示例

- “这个接口有什么字段” -> `ask_data`
- “这张图最高点是什么时候” -> `ask_chart`
- “把第二章总结成三句话” -> `ask_doc_summary`
- “把这张图改成柱状图” -> `ask_edit`
- “生成一页管理层汇报页” -> `ask_generate`
- “帮我分析华东区域过去7天的风险原因” -> `ask_analysis`

---

## 4. 对象定位

## 4.1 为什么必须做对象定位

在 ChatBI 场景里，“这个图”“上一页”“第二章”“那个容量图”都不是纯文本问题，而是对页面对象的指代。

如果完全让模型自由猜，稳定性会很差。

因此必须先做对象定位层。

## 4.2 Object Registry

打开文档时，系统应构建一份对象注册表。

建议结构：

```json
{
  "docId": "tpl_001",
  "objects": [
    {
      "objectId": "chart_1",
      "kind": "chart",
      "title": "区域告警趋势",
      "pageId": "slide_2",
      "sectionId": null,
      "chartType": "line",
      "fieldKeywords": ["告警", "趋势", "区域", "日期"],
      "sourceRefs": ["ops_alarm_trend"]
    }
  ]
}
```

## 4.3 对象定位顺序

建议固定顺序：

1. 当前 UI 选中对象
2. 当前可见页 / 可见章节
3. 最近一次明确提到的对象
4. 文本检索匹配 object registry
5. 仍有歧义时追问用户

### 4.4 本阶段不建议

- 只靠模型猜对象
- 不做对象注册表
- 不记录最近一次操作对象

---

## 5. Working Memory

Working Memory 用于保存“当前这一轮任务真正需要的上下文”。

建议结构：

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
  "templateVariables": {
    "region": "华东",
    "from": "2026-03-01",
    "to": "2026-03-07"
  }
}
```

Working Memory 建议直接保存在：

- Python 服务内存
- 或 Redis 替代

第一阶段如果不想引入 Redis，可先存：

- 进程内字典
- 或本地 JSON cache

---

## 6. Episodic Memory

Episodic Memory 用于保存“这个线程里发生过什么”。

例如：

- 用户问过什么
- 系统解析成什么意图
- 命中了哪个对象
- 执行过哪个分析计划
- 哪个建议被接受或拒绝

建议结构：

```json
{
  "threadId": "thread_001",
  "turnId": "turn_008",
  "intent": "ask_edit",
  "resolvedObjectIds": ["chart_1"],
  "userText": "把这个图改成柱状图",
  "assistantAction": {
    "type": "command_plan",
    "summary": "建议将折线图切换为柱状图并保留标签"
  },
  "accepted": true,
  "createdAt": "2026-03-10T10:00:00+08:00"
}
```

建议第一阶段存成：

- SQLite 表
- 或 JSONL 文件

不需要上复杂记忆系统。

---

## 7. Semantic Memory

Semantic Memory 用于保存跨线程、跨文档仍然稳定成立的信息。

例如：

- 数据源定义
- 字段 label 映射
- 对象索引摘要
- 用户偏好
- 常见模板变量

这层建议结构化存储。

第一阶段可选：

- SQLite
- 可选 `OpenSearch`

如果引入 `OpenSearch`，建议只做：

- 对象摘要检索
- 历史摘要检索
- 数据源说明检索

不建议第一阶段让 `OpenSearch` 承担主事务数据库职责。

---

## 8. Markdown 归档

Markdown 仍然有价值，但只用于归档和人工可读摘要。

建议每个线程周期性生成：

- `thread-summary.md`
- `analysis-notes.md`

用途：

- 人工排查
- 客户演示回顾
- 失败 case 沉淀

但运行时读取优先级应低于 JSON 结构化记忆。

---

## 9. Prompt 上下文组装策略

### 9.1 组装原则

每次调用 scene 时，只注入最小必要上下文：

- 当前意图
- 当前对象摘要
- 当前变量
- 最近 1~3 轮相关 turn 摘要
- 必要的数据 schema / 样例 / 结果摘要

### 9.2 不应直接注入

- 整份文档全部 JSON
- 全量历史对话
- 全量数据明细
- 全量对象注册表

### 9.3 上下文裁剪顺序

建议优先保留：

1. 当前对象
2. 当前问题
3. 当前变量
4. 最近相关 turns
5. 结果摘要

低优先级才保留：

- 远古历史
- 不相关对象
- 大段重复文案

---

## 10. 问答与修改混合场景

在同一线程里，用户可能连续发出：

- 解释问题
- 数据问题
- 修改请求
- 总结请求

所以线程状态必须记录“当前任务链”。

建议增加：

- `activeTaskType`
- `activeTaskTarget`
- `lastActionType`

示例：

```json
{
  "activeTaskType": "report_analysis",
  "activeTaskTarget": "section_2",
  "lastActionType": "chart_ask"
}
```

这样后面一句“那把它改成柱图”时，系统才能较稳地知道“它”是谁。

---

## 11. 对话路由器设计

建议新增组合层：

- `conversation_router`

职责：

- 意图分类
- 对象定位
- 记忆读取
- scene 选择
- prompt context 构建

### 11.1 推荐输出结构

```json
{
  "intent": "ask_chart",
  "scene": "chart_ask",
  "resolvedObjects": ["chart_1"],
  "confidence": 0.92,
  "needsClarification": false
}
```

如果低置信度：

```json
{
  "needsClarification": true,
  "clarificationQuestion": "你说的是第二章的告警趋势图，还是容量利用率图？"
}
```

---

## 12. 推荐存储方案

### 12.1 第一阶段

- Working Memory：进程内或本地 JSON cache
- Episodic Memory：SQLite / JSONL
- Semantic Memory：SQLite，可选 `OpenSearch`
- Markdown：文件归档

### 12.2 第二阶段再考虑

- Redis
- 专门向量库
- 跨实例分布式会话管理

---

## 13. 与现有能力的组合关系

建议未来组合关系如下：

- `conversation_router`
  - 路由到 `chart_ask`
  - 路由到 `data_guide`
  - 路由到 `story_summary`
  - 路由到 `command_plan`
  - 路由到 `analysis_planner`

因此“统一入口”不是一个万能 prompt，而是一个轻量编排层。

---

## 14. 推荐落地顺序

1. `object registry`
2. `working memory`
3. `episodic memory`
4. `conversation router`
5. `markdown summary export`
6. `OpenSearch semantic retrieval`

---

## 15. 当前结论

ChatBI 的统一对话入口要想稳定，关键不是把更多上下文塞给模型，而是：

- 先做对象定位
- 再做意图路由
- 再做结构化记忆

而且第一阶段完全可以采用轻量方案：

- JSON
- SQLite
- 可选 OpenSearch
- Markdown 归档

不需要一开始就引入重型记忆框架。
