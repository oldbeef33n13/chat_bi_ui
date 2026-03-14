# AI AnalysisPlan DSL 详细协议

## 1. 目标

本协议定义 ChatBI 轻量化分析执行链中的 `Analysis Plan DSL` 详细 contract。

使用场景：

- 大数据量分析
- 多数据源并行对比
- 受控多数据源 join
- 定时任务后的自动分析

本协议是：

- LLM 输出协议
- Planner 与 Executor 的边界协议
- 回放、评测、审计的统一格式

本协议不是：

- Python 代码
- SQL 文本
- 图表 DSL

---

## 2. 版本策略

当前版本：

- `ap_v1`

升级原则：

- 只增不改
- 字段新增保持向后兼容
- 执行器按 `version` 分派解析

---

## 3. 顶层结构

## 3.1 JSON 结构

```json
{
  "version": "ap_v1",
  "goal": "分析华东区域近7天告警高峰原因",
  "analysisMode": "single_source",
  "sources": [
    {
      "alias": "alarms",
      "sourceId": "ops_alarm_trend"
    }
  ],
  "steps": [],
  "finalOutputs": [
    {
      "stepId": "step_04",
      "as": "summary_table"
    }
  ],
  "explanation": [
    "先筛选华东区域近7天数据",
    "再按天汇总告警量并找出峰值"
  ]
}
```

## 3.2 字段说明

- `version: string`
  固定为 `ap_v1`
- `goal: string`
  本次分析目标，面向业务语义
- `analysisMode: string`
  `single_source | multi_source_compare | multi_source_join`
- `sources: AnalysisSource[]`
  本次分析引用的数据源定义
- `steps: AnalysisStep[]`
  具体执行步骤
- `finalOutputs: FinalOutputRef[]`
  最终输出引用
- `explanation: string[]`
  面向用户的执行解释，不参与执行

---

## 4. Source 定义

## 4.1 AnalysisSource

```json
{
  "alias": "alarms",
  "sourceId": "ops_alarm_trend"
}
```

字段说明：

- `alias`
  计划内引用别名，必须唯一
- `sourceId`
  真实数据源 ID

约束：

- `alias` 只允许 `[a-z][a-z0-9_]{0,31}`
- `sources` 至少 1 个，最多 5 个

---

## 5. Step 通用结构

## 5.1 AnalysisStep

```json
{
  "id": "step_02",
  "op": "group_aggregate",
  "input": "step_01",
  "params": {},
  "output": "daily_alarm_summary",
  "explain": "按日期汇总每日告警总量"
}
```

字段说明：

- `id`
  步骤唯一 ID，格式建议 `step_01`
- `op`
  算子名
- `input`
  输入引用，可为单个字符串或字符串数组
- `params`
  当前算子参数
- `output`
  输出别名
- `explain`
  步骤业务说明

约束：

- `id` 必须唯一
- `output` 必须唯一
- `input` 只能引用：
  - `sources.alias`
  - 前序 step 的 `output`
- 不允许前向引用

---

## 6. 算子白名单

当前只允许以下算子：

- `select_columns`
- `filter_rows`
- `derive_column`
- `group_aggregate`
- `sort_rows`
- `top_n`
- `limit_rows`
- `time_bucket`
- `pivot_table`
- `fill_nulls`
- `describe_numeric`
- `count_distinct`
- `detect_outliers`
- `compare_period`
- `join_sources`

---

## 7. 各算子详细协议

## 7.1 `select_columns`

```json
{
  "id": "step_01",
  "op": "select_columns",
  "input": "alarms",
  "params": {
    "columns": ["stat_date", "region", "alarm_count"]
  },
  "output": "alarms_selected"
}
```

参数：

- `columns: string[]`

约束：

- 至少 1 列
- 不允许重复列名

---

## 7.2 `filter_rows`

```json
{
  "id": "step_02",
  "op": "filter_rows",
  "input": "alarms_selected",
  "params": {
    "logic": "and",
    "conditions": [
      { "field": "region", "op": "eq", "value": "华东" },
      { "field": "stat_date", "op": "between", "value": ["2026-03-01", "2026-03-07"] }
    ]
  },
  "output": "alarms_filtered"
}
```

参数：

- `logic: and | or`
- `conditions: Condition[]`

允许条件：

- `eq`
- `neq`
- `in`
- `not_in`
- `gt`
- `gte`
- `lt`
- `lte`
- `between`
- `contains`
- `startswith`
- `endswith`
- `is_null`
- `not_null`

---

## 7.3 `derive_column`

```json
{
  "id": "step_03",
  "op": "derive_column",
  "input": "alarms_filtered",
  "params": {
    "field": "stat_date",
    "transform": "date_to_week",
    "as": "stat_week"
  },
  "output": "alarms_derived"
}
```

参数：

- `field: string`
- `transform: string`
- `as: string`
- `options?: object`

允许 transform：

- `date_to_day`
- `date_to_week`
- `date_to_month`
- `pct_change`
- `ratio`
- `bucketize`
- `concat_labels`

不允许任意表达式。

---

## 7.4 `group_aggregate`

```json
{
  "id": "step_04",
  "op": "group_aggregate",
  "input": "alarms_filtered",
  "params": {
    "groupBy": ["stat_date"],
    "metrics": [
      {
        "field": "alarm_count",
        "agg": "sum",
        "as": "alarm_total"
      }
    ]
  },
  "output": "daily_alarm_summary"
}
```

参数：

- `groupBy: string[]`
- `metrics: MetricAgg[]`

允许聚合：

- `sum`
- `avg`
- `min`
- `max`
- `count`
- `count_distinct`

---

## 7.5 `sort_rows`

```json
{
  "id": "step_05",
  "op": "sort_rows",
  "input": "daily_alarm_summary",
  "params": {
    "by": [
      { "field": "alarm_total", "direction": "desc" }
    ]
  },
  "output": "daily_alarm_sorted"
}
```

---

## 7.6 `top_n`

```json
{
  "id": "step_06",
  "op": "top_n",
  "input": "daily_alarm_sorted",
  "params": {
    "field": "alarm_total",
    "n": 5,
    "direction": "desc"
  },
  "output": "top_days"
}
```

约束：

- `n` 范围：`1 ~ 100`

---

## 7.7 `limit_rows`

```json
{
  "id": "step_07",
  "op": "limit_rows",
  "input": "top_days",
  "params": {
    "limit": 10
  },
  "output": "top_days_limited"
}
```

---

## 7.8 `time_bucket`

```json
{
  "id": "step_08",
  "op": "time_bucket",
  "input": "alarms_filtered",
  "params": {
    "field": "stat_date",
    "grain": "day"
  },
  "output": "alarms_bucketed"
}
```

允许粒度：

- `hour`
- `day`
- `week`
- `month`

---

## 7.9 `pivot_table`

```json
{
  "id": "step_09",
  "op": "pivot_table",
  "input": "alarms_filtered",
  "params": {
    "index": ["stat_date"],
    "columns": ["severity"],
    "values": [
      { "field": "alarm_count", "agg": "sum" }
    ]
  },
  "output": "alarm_pivot"
}
```

---

## 7.10 `fill_nulls`

```json
{
  "id": "step_10",
  "op": "fill_nulls",
  "input": "alarm_pivot",
  "params": {
    "fields": ["critical", "major", "minor"],
    "value": 0
  },
  "output": "alarm_pivot_filled"
}
```

---

## 7.11 `describe_numeric`

```json
{
  "id": "step_11",
  "op": "describe_numeric",
  "input": "alarms_filtered",
  "params": {
    "fields": ["alarm_count"]
  },
  "output": "alarm_stats"
}
```

---

## 7.12 `count_distinct`

```json
{
  "id": "step_12",
  "op": "count_distinct",
  "input": "alarms_filtered",
  "params": {
    "field": "device_id",
    "as": "device_count"
  },
  "output": "device_distinct"
}
```

---

## 7.13 `detect_outliers`

```json
{
  "id": "step_13",
  "op": "detect_outliers",
  "input": "daily_alarm_summary",
  "params": {
    "field": "alarm_total",
    "method": "zscore",
    "threshold": 2.5
  },
  "output": "alarm_outliers"
}
```

允许方法：

- `zscore`
- `iqr`

---

## 7.14 `compare_period`

```json
{
  "id": "step_14",
  "op": "compare_period",
  "input": "daily_alarm_summary",
  "params": {
    "dateField": "stat_date",
    "metricField": "alarm_total",
    "current": ["2026-03-01", "2026-03-07"],
    "previous": ["2026-02-23", "2026-02-29"]
  },
  "output": "alarm_period_compare"
}
```

---

## 7.15 `join_sources`

```json
{
  "id": "step_15",
  "op": "join_sources",
  "input": ["alarms_daily", "tickets_daily"],
  "params": {
    "leftKey": ["region", "stat_date"],
    "rightKey": ["region", "stat_date"],
    "joinType": "left"
  },
  "output": "alarm_ticket_joined"
}
```

允许 joinType：

- `inner`
- `left`

约束：

- 仅允许两个输入
- 必须命中预声明 `joinHints`

---

## 8. Final Output 协议

```json
{
  "stepId": "step_04",
  "as": "summary_table"
}
```

字段：

- `stepId`
  引用最终需要暴露给 summary 阶段的 step
- `as`
  结果别名

约束：

- 至少 1 个
- 最多 5 个

---

## 9. 校验规则

## 9.1 结构校验

- 顶层字段完整
- `version` 合法
- `analysisMode` 合法
- `sources/steps/finalOutputs` 非空

## 9.2 引用校验

- `input` 引用必须存在
- 不允许引用未来输出
- `finalOutputs.stepId` 必须存在

## 9.3 字段校验

- 列名必须存在于输入 schema
- 聚合字段必须是数值或可计数字段
- 时间粒度操作必须针对时间字段

## 9.4 安全校验

- 算子必须在白名单
- 参数字段必须在白名单
- 不允许任意表达式
- 不允许超出单任务算子数上限

---

## 10. 执行限制

建议第一阶段限制：

- 最大 source 数：`5`
- 最大 step 数：`20`
- 单个结果表最大回传行数：`200`
- 单次执行超时：`15s`
- 单次内存预算：`512MB`

这些限制写进执行器，不只写进 prompt。

---

## 11. 执行结果协议

```json
{
  "status": "succeeded",
  "resultTables": [
    {
      "name": "summary_table",
      "columns": ["stat_date", "alarm_total"],
      "rows": [
        { "stat_date": "2026-03-01", "alarm_total": 120 }
      ],
      "rowCount": 7
    }
  ],
  "stats": {
    "inputRows": 10000,
    "outputRows": 7,
    "latencyMs": 430
  },
  "provenance": {
    "sources": ["ops_alarm_trend"],
    "executedSteps": ["step_01", "step_02", "step_04"]
  }
}
```

---

## 12. 错误码建议

建议统一错误码：

- `AP_INVALID_VERSION`
- `AP_INVALID_MODE`
- `AP_UNKNOWN_OPERATOR`
- `AP_INVALID_REFERENCE`
- `AP_DUPLICATE_OUTPUT`
- `AP_FIELD_NOT_FOUND`
- `AP_INVALID_AGG`
- `AP_INVALID_JOIN`
- `AP_STEP_LIMIT_EXCEEDED`
- `AP_EXEC_TIMEOUT`
- `AP_EXEC_OOM`
- `AP_EXEC_INTERNAL_ERROR`

---

## 13. Planner 输出要求

LLM 生成该协议时应满足：

- 只输出 JSON
- 不输出多余解释文本
- `steps` 保持最小必要
- 优先用简单算子组合
- 无法确定时选择更稳的计划

不允许：

- 发明新算子
- 使用未声明字段
- 把总结文字写进 `steps`

---

## 14. 首批实现范围

第一阶段建议只真正实现：

- `select_columns`
- `filter_rows`
- `group_aggregate`
- `sort_rows`
- `top_n`
- `limit_rows`
- `time_bucket`
- `describe_numeric`
- `compare_period`

以下可以先定义协议、后实现：

- `pivot_table`
- `detect_outliers`
- `join_sources`

---

## 15. 当前结论

`Analysis Plan DSL` 必须足够小、足够严、足够可验。

对当前 ChatBI 来说，最合理的路线不是让模型直接写执行代码，而是：

- 模型输出 `ap_v1`
- 本地执行器严格校验
- 只执行白名单算子

这样后续前端、后端、定时任务、评测才能共享同一套分析能力。
