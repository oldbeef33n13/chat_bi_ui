# AI Prompt Registry 设计规范

## 1. 目标

Prompt Registry 的目标，不是单纯存几段 prompt 文本，而是为 AI 服务提供一套可管理、可追踪、可回归的 prompt 基础设施。

核心目标：

- prompt 不散落在代码里
- 每个 scene 的 prompt 可版本化
- prompt 变更可追踪
- prompt 可被评估和回放

---

## 2. 为什么需要 Prompt Registry

当前每个 scene 已经有独立 `prompt.py`，这是正确方向，但还不够。

如果后续要持续迭代，就会遇到这些问题：

- prompt 改过什么很难追踪
- 哪一版效果更好无法比较
- 不同环境可能用到不同 prompt
- 回归测试时无法锁定具体 prompt 版本

所以需要一个更正式的 Prompt Registry。

---

## 3. 设计原则

### 3.1 Scene 级管理

prompt 必须按 scene 组织，而不是做一份总表。

例如：

- `command_plan`
- `chart_recommend`
- `chart_ask`
- `data_guide`
- `story_summary`

### 3.2 版本化

每个 scene 的 prompt 都必须有版本号。

建议格式：

- `v2`
- `v3`
- `v4`

或更细：

- `chart_recommend:v2`
- `chart_recommend:v3`

### 3.3 结构化元数据

每条 prompt 不只是文本，还应带元信息：

- `scene`
- `version`
- `status`
- `author`
- `updatedAt`
- `goal`
- `notes`

### 3.4 运行时可解析

运行时应通过 registry 取 prompt，而不是让 service 直接 import 固定常量。

---

## 4. 建议结构

当前实现采用轻量版 JSON catalog：

```text
app/
  core/
    prompt_registry/
      registry.py
      scenes/
        command_plan.json
        chart_recommend.json
        chart_ask.json
        data_guide.json
        story_summary.json
```

---

## 5. Prompt 记录模型

建议每条 prompt 至少具备以下字段：

```json
{
  "scene": "chart_recommend",
  "version": "v2",
  "status": "active",
  "goal": "根据字段和样例数据推荐图表类型与基础绑定",
  "systemPrompt": "...",
  "outputContract": {
    "chartType": "string",
    "bindings": "array",
    "reasons": "array"
  },
  "notes": "当前稳定版本，用于独立 AI 服务默认运行",
  "updatedAt": "2026-03-10T00:00:00Z"
}
```

---

## 6. 运行时选择策略

运行时建议支持三层选择：

### 6.1 默认 active 版本

每个 scene 默认只指定一个 `active` 版本。

### 6.2 显式版本

评估或回放时，可以显式指定：

- `scene=chart_recommend`
- `version=v2`

### 6.3 灰度版本

后续可以支持：

- `stable`
- `candidate`
- `experiment`

但第一阶段不建议做复杂灰度流量。

---

## 7. Prompt 与 Service 的关系

建议关系是：

- `scene.service` 不直接硬编码 prompt
- `scene.service` 通过 `prompt registry` 拿当前版本

也就是：

`service -> prompt registry -> prompt content`

好处：

- 更换 prompt 不需要改 scene service 逻辑
- 测试时可以强制指定版本
- eval 时可以一批样例对多个版本做对比

---

## 8. Prompt 更新流程建议

建议以后统一按这个流程改 prompt：

1. 新增候选版本
2. 跑 scene 样例
3. 跑 eval
4. 对比质量
5. 再切 active

当前服务从 `v2` 起步，不保留 `v1` 历史包袱；后续版本直接在 `v2 -> v3 -> v4` 上演进。

---

## 9. 与 Eval 的关系

Prompt Registry 的真正价值，在于和 eval 配套。

建议 eval 结果至少记录：

- scene
- prompt version
- provider
- 输入样例 ID
- 输出摘要
- 评分结果

这样才能知道：

- 哪个 prompt 更好
- 哪类样例更容易失败
- fallback 触发比例是多少

---

## 10. 推荐实施顺序

建议先做轻量版：

1. `registry.py`
2. 每个 scene 一个 JSON/Markdown prompt 文件
3. service 改成从 registry 取 prompt
4. eval 支持指定 prompt version

后面再加：

- prompt status
- prompt compare
- prompt rollout

---

## 11. 当前结论

Prompt Registry 是 AI 服务从“能跑”走向“可持续演进”的关键基础设施。

它解决的核心不是调用模型，而是：

- 如何稳定迭代 prompt
- 如何知道 prompt 变更是否真的变好

所以它应该优先于大规模前端接入。
