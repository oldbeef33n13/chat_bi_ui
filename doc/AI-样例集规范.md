# AI 样例集规范

## 1. 目标

AI 样例集的目标，是为 `chatbi-ai-service` 提供一套稳定、可回放、可评估的输入基线。

它不是简单的“放几条 demo 数据”，而是要承担 4 个作用：

- 支撑 scene 开发
- 支撑 prompt 调整
- 支撑 CLI 回放
- 支撑 eval 与 benchmark

---

## 2. 设计原则

### 2.1 样例优先于实现细节

先把样例集定义好，再做 CLI、prompt registry、eval。

原因：

- 没有样例，CLI 无法稳定回放
- 没有样例，prompt 调整无法对比
- 没有样例，准确率没有统一口径

### 2.2 样例必须可复现

每个样例必须具备：

- 固定输入
- 固定预期
- 固定说明
- 固定评分约束

### 2.3 样例必须场景化

样例不能只按“技术类型”组织，应优先按 scene 组织。

例如：

- `command_plan`
- `chart_recommend`
- `chart_ask`
- `data_guide`
- `story_summary`

### 2.4 样例必须覆盖真实业务语境

样例应优先覆盖当前产品的核心场景：

- 网络运维
- dashboard 大屏
- report 周报
- ppt 汇报

---

## 3. 目录结构建议

建议后续在 AI 服务目录下增加：

```text
tools/chatbi-ai-service/
  evals/
    command_plan/
      case_001.json
      case_002.json
    chart_recommend/
      case_001.json
      case_002.json
    chart_ask/
      case_001.json
      case_002.json
    data_guide/
      case_001.json
      case_002.json
    story_summary/
      case_001.json
      case_002.json
```

如果后续样例越来越多，可以再扩成：

```text
evals/
  chart_recommend/
    basic/
    edge/
    multilingual/
    dirty_data/
```

第一阶段不建议过度分层，先按 scene 平铺即可。

---

## 4. 单条样例格式

建议每条样例统一采用 JSON。

统一结构建议：

```json
{
  "id": "chart_recommend_001",
  "scene": "chart_recommend",
  "title": "时间趋势单指标推荐",
  "description": "时间字段加单个指标字段，应优先推荐趋势图",
  "tags": ["trend", "time-series", "basic"],
  "input": {},
  "expect": {},
  "score": {},
  "notes": "用于基础趋势推荐回归"
}
```

字段说明：

- `id`
  样例唯一 ID
- `scene`
  所属 scene
- `title`
  简短标题
- `description`
  业务描述
- `tags`
  方便后续过滤和统计
- `input`
  输入载荷
- `expect`
  预期结果约束
- `score`
  评分方式约束
- `notes`
  可选备注

---

## 5. 各 Scene 的输入样例规范

## 5.1 command_plan

输入建议：

```json
{
  "input": "改成柱状图并开启标签",
  "currentNodeId": "chart_1",
  "root": {
    "id": "root_1",
    "kind": "dashboard",
    "children": []
  }
}
```

适合覆盖：

- 图类型修改
- 标签开关
- 平滑开关
- 应用主题
- 多动作组合
- 模糊输入

## 5.2 chart_recommend

输入建议：

```json
{
  "requestedType": "auto",
  "fields": [
    { "name": "stat_date", "label": "统计日期", "type": "time" },
    { "name": "alarm_count", "label": "告警数", "type": "number" }
  ],
  "context": {
    "docType": "dashboard",
    "trigger": "inspector"
  }
}
```

适合覆盖：

- 时间趋势
- 分类对比
- 占比图
- Sankey
- 散点
- 多指标双轴
- 中英文 label 混合

## 5.3 chart_ask

输入建议：

```json
{
  "prompt": "最高点在什么时间",
  "nodeId": "chart_1",
  "spec": {
    "chartType": "line",
    "bindings": [
      { "role": "x", "field": "stat_date" },
      { "role": "y", "field": "alarm_count", "agg": "sum" }
    ]
  },
  "rows": [
    { "stat_date": "2026-03-01", "alarm_count": 10 },
    { "stat_date": "2026-03-02", "alarm_count": 30 }
  ]
}
```

适合覆盖：

- 最高/最低/趋势
- 无数据
- 全零数据
- 带改图要求的问题

## 5.4 data_guide

输入建议：

```json
{
  "name": "ops_alarm_trend",
  "description": "告警趋势统计接口",
  "params": [
    { "name": "region", "label": "区域", "type": "string", "required": true }
  ],
  "fields": [
    { "name": "stat_date", "label": "统计日期", "type": "time" },
    { "name": "alarm_count", "label": "告警数", "type": "number" }
  ],
  "sampleRows": [
    { "stat_date": "2026-03-01", "alarm_count": 10 }
  ]
}
```

## 5.5 story_summary

输入建议：

```json
{
  "docType": "report",
  "title": "网络运行周报",
  "focus": "管理层摘要",
  "insights": [
    "本周华东区域重大告警较上周上升 18%",
    "容量风险主要集中在华南骨干链路"
  ]
}
```

---

## 6. 预期结果格式规范

`expect` 不建议写成“完整结果必须完全一致”，而应该优先写成“关键约束”。

原因：

- 模型输出会有波动
- 文本能力不适合完全字符串比较
- 更适合比较关键结构和关键语义

示例：

```json
{
  "chartTypeIn": ["line", "combo"],
  "mustHaveRoles": ["x", "y"],
  "mustMention": ["趋势"],
  "allowFallback": true
}
```

---

## 7. score 字段规范

建议每条样例可以带自己的评分约束。

例如：

```json
{
  "weights": {
    "structure": 0.2,
    "semantic": 0.6,
    "expression": 0.2
  },
  "minimumPassScore": 0.75
}
```

如果某些样例只关心结构，也可以简化：

```json
{
  "weights": {
    "structure": 0.4,
    "semantic": 0.6
  },
  "minimumPassScore": 0.8
}
```

---

## 8. 样例分类建议

建议每个 scene 的样例至少覆盖 6 类：

### 8.1 Basic

最常见、最标准的 happy path。

### 8.2 Edge

边界输入，例如：

- 字段太少
- rows 为空
- label 缺失

### 8.3 Dirty Data

脏数据，例如：

- null 值
- 重复值
- 类型混乱

### 8.4 Ambiguous

用户表达模糊，例如：

- “帮我优化一下这个图”
- “做得更好看一点”

### 8.5 Multilingual

中英文混合字段、描述和问题。

### 8.6 Business Cases

真实业务场景，例如：

- 网络运维周报
- 告警趋势分析
- 容量风险汇报

---

## 9. 首批样例覆盖建议

建议第一批样例最少做到：

- `command_plan`: 30
- `chart_recommend`: 50
- `chart_ask`: 50
- `data_guide`: 30
- `story_summary`: 30

合计：

- `190` 条

进一步建议：

- `60%` 来自真实业务场景
- `40%` 来自人工构造边界样例

---

## 10. 样例来源建议

建议样例来源分三类：

### 10.1 synthetic

人工构造标准化输入，用于稳定回归。

### 10.2 product_examples

来源于当前产品：

- 内置 dashboard 示例
- report 示例
- ppt 示例
- 内置 mock data-endpoints

### 10.3 failure_cases

来源于未来真实联调中失败的 case。

这类样例价值最高，后续应持续沉淀。

---

## 11. 命名规范

建议样例 ID 统一格式：

```text
<scene>_<category>_<number>
```

例如：

- `chart_recommend_basic_001`
- `chart_ask_edge_003`
- `data_guide_business_012`

这样后续检索和报告更直观。

---

## 12. 与 CLI 的关系

样例集是 CLI 的核心输入来源。

CLI 应支持：

- 按样例 ID 回放
- 按文件回放
- 按目录批量回放

例如：

```bash
python -m app.cli chart-recommend --input evals/chart_recommend/case_001.json
python -m app.cli eval --scene chart_recommend
```

---

## 13. 与 Prompt Registry 的关系

样例集是 Prompt Registry 的验证对象。

没有样例集，就没法回答：

- prompt 当前候选版本是否比当前 active 更好
- 哪些 case 在新版本下退化了

所以顺序上应是：

`先样例集 -> 再 prompt registry -> 再批量 eval`

---

## 14. 推荐落地顺序

建议先这样落：

1. 先创建 `evals/<scene>/`
2. 每个 scene 先放 `5~10` 个基础样例
3. 定好 `input / expect / score` 结构
4. 用 CLI 跑通单条回放
5. 再逐步扩到完整样例规模

---

## 15. 当前结论

AI 样例集不是附属文档，而是后续整个 AI 服务开发的基础设施。

只要样例集设计得稳，后面的：

- CLI
- prompt registry
- eval
- benchmark

都会顺很多。
