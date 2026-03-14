from app.core.settings import is_coding_dashscope_base_url, resolve_openai_model


def test_resolve_openai_model_defaults_for_coding_dashscope():
  assert is_coding_dashscope_base_url("https://coding.dashscope.aliyuncs.com/v1")
  assert resolve_openai_model("https://coding.dashscope.aliyuncs.com/v1", "qwen-plus") == "qwen3.5-plus"
  assert resolve_openai_model("https://coding.dashscope.aliyuncs.com/v1", None) == "qwen3.5-plus"


def test_resolve_openai_model_keeps_explicit_supported_value():
  assert resolve_openai_model("https://coding.dashscope.aliyuncs.com/v1", "qwen3-coder-plus") == "qwen3-coder-plus"
  assert resolve_openai_model("https://dashscope.aliyuncs.com/compatible-mode/v1", None) == "qwen-plus"
