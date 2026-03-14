# chatbi-ai-service

Python AI service for ChatBI.

## Capabilities

- command plan inference
- chart recommendation
- chart Q&A
- data guide generation
- story summary generation

Default mode is local rule-based fallback. The service is designed so later it can sit in front of real LLM providers.

## Architecture

```text
app/
  core/
    settings.py          # provider config, local env loading
    container.py         # composition root
    llm/                 # OpenAI-compatible client
    pipeline/            # preprocess / postprocess / shared semantics
  scenes/
    command_plan/
    chart_recommend/
    chart_ask/
    data_guide/
    story_summary/
```

原则：

- `core` 承载基础设施与洋葱模型外围能力
- `scenes` 按场景独立组织 prompt、规则和服务
- 每个 scene 都支持 `provider -> rule fallback`

## Run

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -e .[dev]
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 18180
```

## Local provider config

推荐把本地模型配置放在以下任一位置：

- `.runtime/ai.env`
- `tools/chatbi-ai-service/.env.local`

参考 [`.env.example`](./.env.example)。

如果使用 `https://coding.dashscope.aliyuncs.com/v1`，建议模型使用：

- `qwen3.5-plus`
- `qwen3-coder-plus`
- `qwen3-max-2026-01-23`

这些文件都不应提交到仓库。

## Test

```bash
.venv\Scripts\python -m pytest
```

## CLI

Single-scene replay:

```bash
python -m app.cli capabilities
python -m app.cli chart-recommend --input evals/chart_recommend/case_001.json --pretty
python -m app.cli command-plan --json "{\"input\":\"改成柱状图并开启标签\",\"currentNodeId\":\"chart_1\"}"
```

With project wrapper:

```bash
npm run ai:cli -- capabilities
npm run ai:cli -- chart-recommend --input tools/chatbi-ai-service/evals/chart_recommend/case_001.json --pretty
npm run ai:cli -- eval --scene chart_recommend --pretty
npm run ai:cli -- eval --case-id story_summary_basic_001 --report markdown
```
