import pytest

from app.core.prompt_registry import PromptRegistry


def test_prompt_registry_loads_active_versions():
  registry = PromptRegistry()
  assert set(registry.list_scenes()) == {
    "chart_ask",
    "chart_recommend",
    "command_plan",
    "data_guide",
    "story_summary",
  }
  assert registry.get_active_versions()["chart_recommend"] == "v2"


def test_prompt_registry_resolves_definition():
  registry = PromptRegistry()
  prompt = registry.get_prompt("data_guide")
  assert prompt.version == "v2"
  assert "数据说明助手" in prompt.systemPrompt


def test_prompt_registry_rejects_unknown_version():
  registry = PromptRegistry()
  with pytest.raises(KeyError):
    registry.get_prompt("chart_recommend", version="v99")


def test_prompt_registry_lists_current_versions():
  registry = PromptRegistry()
  assert registry.list_versions("chart_recommend") == ["v2"]
  prompt = registry.get_prompt("story_summary", version="v2")
  assert prompt.version == "v2"
  assert prompt.status == "active"
