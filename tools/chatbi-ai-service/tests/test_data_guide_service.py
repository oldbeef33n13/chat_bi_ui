from app.models import DataEndpointParam, SourceField
from app.scenes.data_guide.service import normalize_field_guide, normalize_parameter_guide, normalize_recommended_charts


def test_normalize_parameter_guide_fills_missing_fields():
  result = normalize_parameter_guide(
    [{"name": "region", "label": "区域", "description": "过滤区域"}],
    [DataEndpointParam(name="region", label="区域", type="string", required=True, description="过滤区域")],
  )
  assert result == [
    {
      "name": "region",
      "label": "区域 (region)",
      "type": "string",
      "required": True,
      "description": "过滤区域",
    }
  ]


def test_normalize_field_guide_infers_role_and_type():
  result = normalize_field_guide(
    [{"name": "stat_date", "label": "统计日期", "description": "日期"}],
    [SourceField(name="stat_date", label="统计日期", type="time")],
  )
  assert result == [
    {
      "name": "stat_date",
      "label": "统计日期 (stat_date)",
      "type": "time",
      "role": "time",
      "description": "日期",
      "unit": None,
    }
  ]


def test_normalize_recommended_charts_maps_chinese_aliases():
  assert normalize_recommended_charts(["折线图", {"type": "桑基图"}, "数字大字报"]) == ["line", "sankey", "gauge"]
