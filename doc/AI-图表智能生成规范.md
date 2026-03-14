# AI 图表智能生成规范

## 1. 目标

图表智能生成的目标，不是让 AI 直接随意拼一份复杂 `chart spec`，而是帮助用户更快完成这三件事：

- 看懂这份数据适合表达什么
- 快速得到一版合理的图表草稿
- 在可控范围内完成细化调整

核心原则：

`先定分析目标，再定数据绑定，再定图表配置`

---

## 2. 使用场景

适用场景：

- 新建图表
- 从已有数据接口快速选图
- 从自然语言意图生成图表
- 从已有图表切换成更合适的图
- 对当前图表做局部改写

不适用场景：

- 直接生成复杂底层 ECharts 自定义 option
- 直接生成不可解释的大量视觉细节

---

## 3. 生成阶段

图表生成必须按阶段进行，不建议 one-shot 直接输出最终配置。

## 3.1 阶段一：分析意图识别

目标：

- 判断用户到底想看什么

典型意图：

- 趋势
- 对比
- 占比
- 分布
- 关系
- 流向
- 异常
- 排名

输入：

- 用户自然语言
- 当前场景类型（dashboard/report/ppt）
- 数据接口字段信息
- 样例数据

输出：

- `analysisGoal`
- `recommendedChartFamilies`
- `reasoning`

示例：

```json
{
  "analysisGoal": "trend",
  "recommendedChartFamilies": ["line", "combo"],
  "reasoning": [
    "存在时间字段和数值字段",
    "适合看周期变化"
  ]
}
```

## 3.2 阶段二：数据绑定计划

目标：

- 决定字段怎么用

要决定的内容：

- 哪个字段是时间/维度
- 哪个字段是指标
- 是否有系列分组
- 是否有 source/target
- 统计口径
- 排序
- topN
- 时间粒度

输入：

- 字段 schema
- sample rows
- analysisGoal

输出：

- `bindings`
- `aggPlan`
- `filters`
- `sortPlan`

示例：

```json
{
  "bindings": [
    { "role": "x", "field": "stat_date" },
    { "role": "y", "field": "alarm_count", "agg": "sum" },
    { "role": "series", "field": "severity" }
  ],
  "sortPlan": {
    "field": "stat_date",
    "direction": "asc"
  }
}
```

## 3.3 阶段三：图表配置计划

目标：

- 在高层配置上形成一版可渲染草稿

可生成内容：

- 图类型
- 标题 / 副标题
- 图例开关
- 标签开关
- 平滑 / 堆叠 / 双轴
- 配色方案
- 单位展示
- 轴格式

输出：

- `chartPlan`

示例：

```json
{
  "chartType": "line",
  "titleText": "告警趋势",
  "subtitleText": "按日统计",
  "legendShow": true,
  "labelShow": false,
  "smooth": true,
  "paletteRef": "palette.ops.blue"
}
```

## 3.4 阶段四：草稿生成

目标：

- 形成一版最小可用图表草稿

输出：

- `ChartDraft`

它应只包含：

- 图类型
- 绑定
- 高层配置
- 推荐理由

而不是底层不可控渲染细节。

## 3.5 阶段五：细化调整

目标：

- 在已有草稿上进一步优化

适合的动作：

- 改图类型
- 增加标签
- 改标题
- 改统计口径
- 改颜色风格
- 增加第二轴

---

## 4. AI 可控制范围

AI 可以直接控制：

- `chartType`
- `bindings`
- `agg`
- `sort / topN`
- `title / subtitle`
- `legendShow / labelShow`
- `smooth / stack / dualAxis`
- `paletteRef / themeRef`
- `axis format` 的高层语义

AI 不建议直接控制：

- 大量底层 ECharts option
- 非必要的视觉像素级细节
- 自定义 renderer 逻辑
- 任意脚本表达式

---

## 5. 用户确认点

图表生成必须至少有两个确认点：

## 5.1 确认点一：分析目标 + 图类型

用户确认：

- 这是趋势图还是对比图
- 推荐图类型是否合理

## 5.2 确认点二：字段绑定 + 统计口径

用户确认：

- 哪个字段做维度
- 哪个字段做指标
- 统计口径是否合理

只有在这两个确认点之后，才建议应用到编辑器。

---

## 6. 图表生成 API 建议

建议后续拆成两个能力，不要一个接口全包：

## 6.1 `chart_recommend`

输入：

- 字段 schema
- sample rows
- requested type
- scene

输出：

- `analysisGoal`
- `chartType`
- `bindings`
- `reasons`

## 6.2 `chart_refine`

输入：

- 当前 chart spec
- 用户追加要求
- sample rows

输出：

- `patch proposal`
- `plan summary`

---

## 7. 默认规则

默认统计口径建议：

- 数值类总量字段：`sum`
- 比率/时延/利用率字段：`avg`
- ID 字段做指标时：`count`
- 文本字段：优先作为维度
- 时间字段：优先作为 X 轴或时间维度

默认图类型建议：

- 时间 + 数值：`line`
- 时间 + 多指标：`combo`
- 分类 + 数值：`bar`
- 分类 + 单指标占比：`pie`
- 多指标关系：`scatter`
- source + target + value：`sankey`

---

## 8. 回退策略

当大模型不可用或输出不稳定时：

1. 回退到规则推荐
2. 保证输出结构合法
3. 不阻塞图表创建

回退模式必须可演示、可测试、可解释。

---

## 9. 当前结论

图表智能生成不应该理解为“AI 直接帮我把图全画完”，而应该理解为：

- 帮你判断这份数据适合怎么表达
- 帮你完成一版高质量的图表草稿
- 帮你在少量确认后完成配置

这是更稳、更低心智的实现方式。
