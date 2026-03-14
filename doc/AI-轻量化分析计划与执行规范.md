# AI 轻量化分析计划与执行规范

## 1. 目标

本规范用于定义 ChatBI 在“大数据量分析”场景下的最小可落地方案。

核心目标：

- 支持用户基于自然语言分析大量数据
- 不把全量原始数据直接塞给大模型
- 不让大模型直接生成任意 Python 代码
- 用最少依赖实现可控、可复现、可回放的分析流程

统一流程：

`问题理解 -> 生成分析计划 -> 安全执行 -> 结果总结`

---

## 2. 设计边界

### 2.1 本阶段明确采用

- Python 独立 AI 服务
- `pandas`
- `numpy`
- 标准库 `json / datetime / math / statistics`
- 现有 Java 后端提供的数据接口
- 可选 `OpenSearch`，仅用于元数据检索和记忆检索

### 2.2 本阶段明确不采用

- MCP
- Skills 框架
- DuckDB
- Polars
- 任意用户 Python 代码执行
- 任意网络访问型 agent
- 多轮自动自治 agent

### 2.3 设计原则

- 轻量优先
- 结构化优先
- 可解释优先
- 安全优先

---

## 3. 为什么不能直接把全量数据交给大模型

即使数据量只有 `1w` 行，也不建议直接把全量 rows 塞进模型。

原因：

- token 成本高
- 延迟高
- 多轮对话时上下文很快溢出
- 原始 rows 噪音大，模型难稳定聚焦
- 很难复现和审计

因此模型应该看到的是：

- 用户问题
- 数据源定义
- 字段标签与 schema
- 数据 profile
- 少量 sample rows
- 执行后的中间结果与统计摘要

而不是全量明细表本身。

---

## 4. 总体流程

推荐固定为三段式：

### Step 1. Analysis Planner

输入：

- 用户问题
- 数据源 schema
- 字段 label
- 数据 profile
- sample rows
- 当前文档/图表上下文

输出：

- `Analysis Plan DSL`

### Step 2. Safe Executor

输入：

- 全量数据
- `Analysis Plan DSL`

输出：

- 中间结果表
- 聚合结果
- 指标摘要
- 异常候选
- provenance

### Step 3. Result Summarizer

输入：

- 用户问题
- 执行结果
- provenance

输出：

- 结论
- 证据
- 风险/异常
- 建议
- 下一步可执行动作

---

## 5. Analysis Plan DSL

### 5.1 目标

`Analysis Plan DSL` 是模型输出的唯一执行计划格式。

它不是：

- Python 代码
- SQL 文本
- 最终图表 DSL

它是受限、可校验、可回放的分析计划。

### 5.2 顶层结构建议

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

### 5.3 顶层字段说明

- `version`
  固定为当前 DSL 版本，例如 `ap_v1`
- `goal`
  本次分析的业务目标
- `analysisMode`
  `single_source | multi_source_compare | multi_source_join`
- `sources`
  本次分析使用到的数据源别名
- `steps`
  执行步骤数组
- `finalOutputs`
  最终输出引用
- `explanation`
  面向用户的自然语言执行说明

---

## 6. 算子设计

### 6.1 允许的算子

第一阶段只允许这些算子：

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

### 6.2 不允许的算子

- 任意 Python 表达式
- 任意 `eval`
- 任意 `exec`
- 任意文件写入
- 任意网络读取
- 任意 import

### 6.3 Step 结构建议

```json
{
  "id": "step_02",
  "op": "group_aggregate",
  "input": "step_01",
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
  "output": "daily_alarm_summary",
  "explain": "按日期汇总每日告警总量"
}
```

### 6.4 参数白名单

#### `filter_rows`

只允许这些条件：

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

#### `group_aggregate`

只允许这些聚合方式：

- `sum`
- `avg`
- `min`
- `max`
- `count`
- `count_distinct`

#### `derive_column`

只允许模板化表达，不允许任意表达式。

例如：

- `date_to_week`
- `date_to_month`
- `pct_change`
- `ratio`
- `bucketize`
- `concat_labels`

---

## 7. 执行器设计

### 7.1 目标

执行器负责把 `Analysis Plan DSL` 编译成 `pandas` 操作并执行。

执行器不接受：

- 原始 Python 代码
- 原始 SQL

### 7.2 推荐实现

建议独立目录：

```text
tools/chatbi-ai-service/
  app/
    analysis/
      plan_models.py
      validator.py
      executor.py
      operators/
        select_columns.py
        filter_rows.py
        group_aggregate.py
        join_sources.py
```

### 7.3 执行模式

建议每次执行都放到单独 worker 进程中运行：

- 主进程负责校验 plan
- worker 负责真正跑 `pandas`
- 执行完返回结果摘要

### 7.4 安全边界

第一阶段安全控制建议：

- worker 无网络访问
- 只允许读取临时数据目录
- CPU 时间限制
- 内存限制
- 单次任务超时
- 只允许执行白名单算子
- 不暴露任意 Python 运行入口

### 7.5 输出结构建议

```json
{
  "status": "succeeded",
  "resultTables": [
    {
      "name": "daily_alarm_summary",
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
    "executedSteps": ["step_01", "step_02", "step_03"]
  }
}
```

---

## 8. 数据输入策略

### 8.1 Planner 阶段输入

Planner 只看这些：

- schema
- label
- profile
- sample rows
- 当前问题

### 8.2 Executor 阶段输入

Executor 才读取全量数据。

### 8.3 Summary 阶段输入

Summary 只看：

- 结果表
- 统计摘要
- provenance
- 用户原问题

这样可以控制 token 和延迟。

---

## 9. 数据 Profile 规范

在不发送全量数据给模型的前提下，需要先构建 profile。

建议每个字段提供：

- `name`
- `label`
- `type`
- `nullRatio`
- `distinctCount`
- `min/max`
- `sampleValues`
- `semanticRole`
  - `time`
  - `dimension`
  - `metric`
  - `id`
  - `ratio`

模型先用 profile 规划，不直接看海量 rows。

---

## 10. 总结器设计

### 10.1 输入

- 用户问题
- 执行结果
- 关键统计值
- 异常候选

### 10.2 输出

建议统一结构：

```json
{
  "headline": "华东区域近7天告警高峰出现在 3 月 4 日",
  "conclusion": "华东区域告警量在 3 月 4 日显著升高，随后回落。",
  "evidence": [
    "3 月 4 日告警总量达到近 7 天峰值",
    "峰值较近 7 天均值高出 38%"
  ],
  "advice": [
    "建议进一步查看 3 月 4 日的告警分类明细",
    "建议补充区域链路变更记录做交叉分析"
  ]
}
```

### 10.3 禁止事项

- 不允许编造未出现在结果中的事实
- 不允许忽略 provenance
- 不允许只输出空泛描述

---

## 11. 与现有 AI 原子能力的关系

本规范新增的是组合层，不替代现有原子能力。

关系建议：

- `analysis_planner`
  负责生成 `Analysis Plan DSL`
- `analysis_executor`
  非 LLM 执行层
- `story_summary`
  可复用于结果总结
- `chart_recommend`
  可用于从执行结果生成可视化建议
- `chart_ask`
  可用于对执行后的结果图继续追问

---

## 12. 推荐落地顺序

建议按这个顺序实现：

1. `plan_models + validator`
2. `pandas executor`
3. `单数据源基础算子`
4. `summary contract`
5. `compare_period / outlier_detect`
6. `join_sources`

---

## 13. 当前结论

对 ChatBI 而言，大数据量分析的合理落地不是：

- 把全量数据直接给大模型
- 让大模型直接写 `pandas` 代码并执行

而是：

`让大模型只负责产受限分析计划`
`让 Python 执行体安全地执行计划`
`再让大模型基于执行结果做总结`

这是一套更轻、更稳、更适合当前工程现状的方案。
