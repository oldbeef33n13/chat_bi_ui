# evals

Scene-based evaluation case set for `chatbi-ai-service`.

Current scenes:

- `command_plan`
- `chart_recommend`
- `chart_ask`
- `data_guide`
- `story_summary`

Composed flow skeletons:

- `composed/router`
- `composed/analysis_pipeline`
- `composed/multi_source`
- `composed/conversation`

Each case follows the structure defined in `doc/AI-样例集规范.md`.
Composed cases additionally follow `doc/AI-组合场景测试规范.md`.

Common tags:

- `basic`
- `complex`
- `business`
- `ops`
- `trend`
- `comparison`
- `sankey`
- `management`

Use CLI filters to run a focused subset, for example:

- `python -m app.cli eval --scene chart_recommend --tag complex`
- `python -m app.cli eval --tag business --tag ops`
