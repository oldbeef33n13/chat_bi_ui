from app.scenes.chart_ask.service import normalize_optional_plan, normalize_string, normalize_string_list


def test_normalize_optional_plan_returns_none_for_non_dict():
  assert normalize_optional_plan([]) is None
  assert normalize_optional_plan("plan") is None


def test_normalize_string_list_splits_string_payload():
  assert normalize_string_list("先看峰值；再看趋势") == ["先看峰值", "再看趋势"]


def test_normalize_string_keeps_non_empty_text():
  assert normalize_string("  已切换图表  ") == "已切换图表"
