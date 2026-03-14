# AI 轻量化多数据源分析规范

## 1. 目标

本规范定义 ChatBI 在“多数据源分析”场景下的最小可落地方案。

目标是回答：

- 一个问题是否可以同时使用多个数据源
- 多个数据源什么时候做对比，什么时候做 join
- 如何在轻量技术栈下保持可控和可解释

---

## 2. 设计原则

### 2.1 必须支持多数据源

实际业务里，一个问题很少只依赖单一数据源。

例如：

- 告警趋势 + 工单汇总
- 容量负载 + 变更记录
- 服务健康 + 故障明细

因此系统必须支持多数据源输入。

### 2.2 不是所有多源都要 join

多数据源场景建议分三类：

- `single_source`
- `multi_source_compare`
- `multi_source_join`

其中第一阶段最稳的是：

- 单源分析
- 多源并行对比

`join` 只作为受控高级能力。

### 2.3 先受控，再自由

第一阶段不允许模型自由猜测 join 关系。

只允许：

- 使用预声明 join key
- 使用预声明时间粒度
- 使用预声明主键/维度映射

---

## 3. 数据源标准对象

为了支撑多源分析，每个数据源都应先转换成统一描述对象。

建议结构：

```json
{
  "sourceId": "ops_alarm_trend",
  "name": "告警趋势",
  "description": "按时间和区域统计告警量",
  "labels": {
    "stat_date": "统计日期",
    "region": "区域",
    "alarm_count": "告警数"
  },
  "schema": [
    { "name": "stat_date", "type": "time" },
    { "name": "region", "type": "string" },
    { "name": "alarm_count", "type": "number" }
  ],
  "sampleRows": [],
  "profile": {},
  "joinHints": [
    {
      "targetSourceId": "ops_ticket_summary",
      "joinKeys": ["region", "stat_date"],
      "joinType": "left"
    }
  ],
  "timeGrain": "day",
  "freshness": "T+1",
  "owner": "ops_team"
}
```

---

## 4. 多源分析模式

## 4.1 单源分析

适合：

- 单图解读
- 单接口问答
- 单指标趋势

输出：

- 一个 source
- 一个 analysis plan

## 4.2 多源并行对比

适合：

- 告警 vs 工单
- 容量 vs 变更
- 服务可用性 vs 错误率

执行方式：

- 先分别分析每个源
- 再做结论级对比

优点：

- 最稳
- 成本最低
- 最容易解释

## 4.3 多源受控 join

适合：

- 已知可以通过 `region + stat_date` 对齐的数据
- 已知可以通过 `service_id` 关联的数据

限制：

- 必须有预声明 join key
- 必须有预声明粒度
- 必须做 join 前校验

---

## 5. Join 控制规则

### 5.1 允许 join 的前提

必须同时满足：

- 存在 `joinHints`
- join key 在两边 schema 都存在
- 时间粒度可对齐
- 基数风险可接受

### 5.2 第一阶段不支持

- 模型自由猜 join key
- 多对多任意 join
- 无 schema 情况的 join
- 非结构化源和结构化源混合 join

### 5.3 建议支持的 join 类型

第一阶段只支持：

- `inner`
- `left`

不建议第一阶段支持：

- `right`
- `outer`
- `cross`

---

## 6. 多数据源 Analysis Plan 结构

建议 planner 输出中明确声明 source alias。

示例：

```json
{
  "version": "ap_v1",
  "analysisMode": "multi_source_compare",
  "sources": [
    { "alias": "alarms", "sourceId": "ops_alarm_trend" },
    { "alias": "tickets", "sourceId": "ops_ticket_summary" }
  ],
  "steps": [
    {
      "id": "step_01",
      "op": "filter_rows",
      "input": "alarms",
      "params": {
        "conditions": [
          { "field": "region", "op": "eq", "value": "华东" }
        ]
      },
      "output": "alarms_filtered"
    },
    {
      "id": "step_02",
      "op": "filter_rows",
      "input": "tickets",
      "params": {
        "conditions": [
          { "field": "region", "op": "eq", "value": "华东" }
        ]
      },
      "output": "tickets_filtered"
    }
  ],
  "finalOutputs": [
    { "stepId": "step_01", "as": "alarm_view" },
    { "stepId": "step_02", "as": "ticket_view" }
  ]
}
```

如果是 join：

```json
{
  "id": "step_03",
  "op": "join_sources",
  "input": ["alarms_daily", "tickets_daily"],
  "params": {
    "leftKey": ["region", "stat_date"],
    "rightKey": ["region", "stat_date"],
    "joinType": "left"
  },
  "output": "joined_daily"
}
```

---

## 7. Planner 输入建议

在多数据源场景中，Planner 不应该直接收到所有原始 rows。

建议输入：

- 用户问题
- 数据源列表
- 每个数据源的 schema
- label 映射
- profile
- sample rows
- `joinHints`

### 7.1 必须额外提供的信息

- 当前分析目标
- 哪些数据源是候选
- 哪些数据源允许 join
- 是否允许跨源聚合

### 7.2 不建议让模型自己决定的事情

- 任意选源
- 任意猜 join key
- 任意猜时间粒度

---

## 8. 执行器策略

### 8.1 推荐执行方式

仍然采用 `pandas executor`，不引入新执行引擎。

执行器需要新增：

- source alias 解析
- join 校验
- 多表结果缓存

### 8.2 中间结果管理

建议每个 step 输出都命名并缓存。

这样好处是：

- 方便回放
- 方便追问
- 方便审计

### 8.3 结果限制

多源分析最终返回给模型的结果仍应做摘要化：

- 结果表截断
- 统计摘要
- 关键差异项

不直接把大 join 表原样送回模型。

---

## 9. OpenSearch 的可选角色

本阶段不把 OpenSearch 用作大表执行引擎。

可选用途只有两类：

### 9.1 元数据检索

用于检索：

- 数据源说明
- 字段 label
- join hints
- 历史用法

### 9.2 会话记忆检索

用于检索：

- 历史分析摘要
- 历史失败 case
- 历史确认过的对象映射

不建议在本阶段让 OpenSearch 承担主计算角色。

---

## 10. 与产品入口的关系

多源分析建议主要出现在这些入口：

- 运行态问答
- 报告章节总结
- Dashboard 风险分析
- 定时任务自动总结

不建议一开始就把它做成“所有图表属性面板都可随意多源分析”。

---

## 11. 推荐落地顺序

建议这样推进：

1. 单源分析
2. 多源并行对比
3. 预声明 key 的双源 join
4. 多源链式 join

不要一开始就做复杂多源混合分析。

---

## 12. 当前结论

ChatBI 的多数据源分析第一阶段应采用：

- `单源`
- `多源并行对比`
- `受控 join`

而不是“任意多源自由混合”。

这条路线更轻、更稳，也更适合当前的 Python 服务与 `pandas` 执行栈。
