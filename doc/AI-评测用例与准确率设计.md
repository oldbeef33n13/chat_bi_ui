# AI 评测用例与准确率设计

## 1. 目标

这份文档的目标，是为 `chatbi-ai-service` 建立一套可持续的评测体系，回答 4 个问题：

1. 这个能力现在是否稳定
2. 这个能力是否足够准确
3. prompt 或 provider 变更后有没有退化
4. 哪些场景最容易失败

这套评测体系不只是为了 CI 跑通，而是为了支持后续 AI 能力持续迭代。

---

## 2. 评测原则

### 2.1 先做“可验证准确率”，再做“主观体验评分”

优先做：

- 输出结构是否正确
- 核心字段是否正确
- 核心分类是否正确
- 关键结论是否基于输入数据

后续再补：

- 文本表达优雅度
- 管理层表达质量
- 数据故事完整性

### 2.2 不依赖单一评测方式

建议至少同时使用：

- `规则评分`
- `样例比对`
- `关键词/结构评分`
- `必要时引入 LLM-as-judge`

但第一阶段不要把 LLM-as-judge 当唯一标准。

### 2.3 评测必须可回放

每个样例必须具备：

- 固定输入
- 固定预期
- 固定评分逻辑

这样才能比较：

- 不同 prompt 版本
- 不同 provider
- 不同模型

---

## 3. 评测层次

建议分 5 层：

## 3.1 L0：Contract 测试

目标：

- 保证输出结构合法

检查：

- response schema
- 必填字段
- 字段类型
- 空值情况

适用：

- 所有 scene

## 3.2 L1：规则能力单测

目标：

- 保证 fallback 一定稳定

检查：

- 本地规则是否输出可用结果
- 边界场景是否不崩
- provider 不可用时是否能兜底

适用：

- fallback 逻辑
- preprocess / postprocess

## 3.3 L2：Scene 样例评测

目标：

- 保证场景语义正确

检查：

- 核心输出是否命中预期
- 关键字段/角色是否合理
- 关键分析是否基于输入

适用：

- `command_plan`
- `chart_recommend`
- `chart_ask`
- `data_guide`
- `story_summary`

## 3.4 L3：Provider Benchmark

目标：

- 对比 provider / prompt version 质量

检查：

- pass rate
- avg latency
- fallback ratio
- per-scene score

## 3.5 L4：端到端业务评测

目标：

- 验证 AI 能力在产品链路中是否真的可用

检查：

- 前端请求
- AI 服务
- 上层消费
- 用户确认链

这一层放后面做，不作为第一阶段重点。

---

## 4. Scene 维度的评测设计

建议先覆盖当前 5 个已落地 scene。

## 4.1 command_plan

### 评测目标

- 用户意图能否正确转成结构化命令

### 关键检查项

- 是否有 `plan`
- `intent` 是否正确
- `targets` 是否合理
- `commands` 是否包含正确动作
- 不应输出无关动作

### 示例场景

- 改图类型
- 开启标签
- 平滑开关
- 应用主题
- 同时修改多个属性
- 模糊意图
- 无法识别意图

### 准确率口径

- `schema_pass`
- `intent_hit`
- `command_type_hit`
- `critical_prop_hit`

建议总分：

- 结构 20
- 意图 30
- 核心命令 30
- 核心属性 20

---

## 4.2 chart_recommend

### 评测目标

- 是否推荐了合理图类型
- 是否给出合理字段绑定

### 关键检查项

- `chartType` 是否命中候选集
- 是否包含必要 role
- 统计口径是否合理
- 推荐理由是否能解释推荐

### 示例场景

- 时间 + 单指标 -> line
- 时间 + 多指标 -> combo
- 分类 + 单指标 -> bar / pie
- source + target + value -> sankey
- 两个数值字段 -> scatter
- 只有文本字段 -> 保守推荐
- 中英文字段混合
- 字段 label 存在但 name 不直观

### 准确率口径

- `chart_type_hit`
- `binding_role_hit`
- `agg_hit`
- `reason_quality`

建议总分：

- 结构 15
- 图类型 35
- 绑定 35
- 理由 15

---

## 4.3 chart_ask

### 评测目标

- 是否给出了基于数据的正确解释
- 是否在适当时机生成 plan

### 关键检查项

- answer 是否基于样例数据
- 结论是否与问题匹配
- suggestions 是否合理
- 若用户要求改图，plan 是否出现

### 示例场景

- 问最高点
- 问最低点
- 问趋势变化
- 问均值
- 没有数据
- 数据全 0
- 用户要求改成柱状图
- 用户要求开启标签/平滑

### 准确率口径

- `answer_fact_hit`
- `question_match`
- `suggestion_quality`
- `plan_presence_hit`

建议总分：

- 结构 15
- 事实正确 45
- 问题匹配 25
- 计划与建议 15

---

## 4.4 data_guide

### 评测目标

- 是否把接口和字段讲明白
- 是否给出了合理推荐

### 关键检查项

- summary 是否完整
- 参数说明是否齐全
- 字段角色是否合理
- 推荐图类型是否合理

### 示例场景

- 标准时间序列接口
- 关系流向接口
- 多维度表格接口
- 带复杂参数的接口
- 字段 label 与 name 差异很大

### 准确率口径

- `summary_ok`
- `param_guide_hit`
- `field_role_hit`
- `recommended_chart_hit`

建议总分：

- 结构 20
- 参数 20
- 字段角色 35
- 推荐图表 25

---

## 4.5 story_summary

### 评测目标

- 是否形成合理的结论、证据、建议

### 关键检查项

- headline 是否准确
- conclusion 是否明确
- evidence 是否引用输入 insight
- advice 是否具有业务方向

### 示例场景

- dashboard 总结
- report 管理层摘要
- ppt 汇报摘要
- 没有 insight 的保守兜底
- 指定 focus 的定向摘要

### 准确率口径

- `headline_hit`
- `conclusion_quality`
- `evidence_grounding`
- `advice_quality`

建议总分：

- 结构 20
- 结论 30
- 证据 30
- 建议 20

---

## 5. 样例集设计

## 5.1 样例类型

建议样例至少覆盖 6 类：

1. `happy path`
2. `边界场景`
3. `模糊输入`
4. `脏数据`
5. `中英混合`
6. `异常/对抗样例`

## 5.2 样例来源

建议样例来源分三类：

- `synthetic`
  人工构造的标准样例
- `product_examples`
  当前工程里的真实示例模板与 mock 数据
- `realized_cases`
  从真实使用中沉淀出来的失败案例

## 5.3 样例规模建议

第一阶段建议最少做到：

- `command_plan`：30 条
- `chart_recommend`：50 条
- `chart_ask`：50 条
- `data_guide`：30 条
- `story_summary`：30 条

合计建议首批至少：

- `190` 条样例

这才足够支撑 prompt 和 provider 的稳定对比。

---

## 6. 准确率设计

## 6.1 准确率不建议只用单一数字

建议至少拆成三类指标：

- `结构准确率`
- `核心语义准确率`
- `整体通过率`

### 结构准确率

含义：

- 输出是否合法
- 必填字段是否齐全

### 核心语义准确率

含义：

- 核心判断是否对
- 核心字段是否对

### 整体通过率

含义：

- 该样例是否达到可接受阈值

## 6.2 推荐公式

对于每个 scene：

```text
scene_score = structure_score * 0.2 + semantic_score * 0.6 + expression_score * 0.2
```

如果该 scene 不依赖表达质量，可改成：

```text
scene_score = structure_score * 0.3 + semantic_score * 0.7
```

## 6.3 全局准确率

建议用加权平均，不同 scene 权重不同：

- `chart_recommend`: 25%
- `chart_ask`: 25%
- `command_plan`: 20%
- `data_guide`: 15%
- `story_summary`: 15%

理由：

- 图表推荐和图表问答对产品体验影响最大

---

## 7. 误差分类

建议每次评测不只看分数，还要记录失败类型。

建议分类：

- `schema_error`
- `missing_field`
- `wrong_chart_type`
- `wrong_binding`
- `wrong_agg`
- `ungrounded_answer`
- `weak_summary`
- `unexpected_plan`
- `fallback_triggered`

这会比只有一个总分更有改进价值。

---

## 8. Provider 对比设计

评测时应记录：

- provider 名称
- model 名称
- prompt version
- average latency
- fallback ratio
- scene score

建议对比维度：

- 规则模式 vs 真模型
- 同一模型不同 prompt version
- 不同模型同一 prompt

---

## 9. CLI 设计

CLI 建议承担两类事情：

## 9.1 单条样例回放

例如：

```bash
python -m app.cli chart-recommend --input evals/chart_recommend/case_01.json
```

用途：

- 开发 prompt
- 调单个案例
- 快速复现问题

## 9.2 批量评测

例如：

```bash
python -m app.cli eval --scene chart_recommend
python -m app.cli eval --all
```

用途：

- 批量回归
- 生成 benchmark
- CI 使用

---

## 10. LLM-as-judge 策略

建议后续再引入，不作为第一阶段主判定方式。

适合使用 LLM-as-judge 的场景：

- `story_summary`
- `report 摘要`
- `ppt 讲稿`

不建议第一阶段使用 LLM-as-judge 的场景：

- `command_plan`
- `chart_recommend`
- `data_guide`

这些更适合规则评分。

---

## 11. 推荐实施顺序

建议顺序：

1. 先补样例集
2. 再补 CLI 单条回放
3. 再补批量 eval
4. 再补 benchmark report
5. 最后再引入 LLM-as-judge

---

## 12. 当前结论

AI 的准确率设计不能只靠“人工感觉不错”。

更合理的方式是：

- 有丰富样例
- 有分 scene 评分
- 有失败分类
- 有 provider 对比
- 有可回放 CLI

这套体系补齐之后，后续不管是改 prompt、改模型，还是接前端，都会稳很多。
