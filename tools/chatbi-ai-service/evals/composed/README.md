# composed evals

This directory stores composed evaluation cases for the next AI orchestration layer.

These cases are not single-scene evals. They describe chained flows such as:

- router + object grounding
- analysis planner + executor + summary
- multi-source analysis
- multi-turn conversation

Current flow groups:

- `router`
- `analysis_pipeline`
- `multi_source`
- `conversation`

These skeleton cases are design-first fixtures and do not participate in the current single-scene eval runner yet.
