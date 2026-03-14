def load_composed_cases(*args, **kwargs):
  from app.core.composed.runner import load_composed_cases as _load_composed_cases

  return _load_composed_cases(*args, **kwargs)


def run_composed_eval(*args, **kwargs):
  from app.core.composed.runner import run_composed_eval as _run_composed_eval

  return _run_composed_eval(*args, **kwargs)


def render_composed_eval_markdown(*args, **kwargs):
  from app.core.composed.reporter import render_composed_eval_markdown as _render_composed_eval_markdown

  return _render_composed_eval_markdown(*args, **kwargs)


__all__ = ["load_composed_cases", "render_composed_eval_markdown", "run_composed_eval"]
