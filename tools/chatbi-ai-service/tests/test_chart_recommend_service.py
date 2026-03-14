from app.scenes.chart_recommend.service import normalize_bindings_payload


def test_normalize_bindings_payload_converts_dict_shape():
  payload = {
    "x": ["stat_date"],
    "y": ["alarm_count", "ticket_count"],
  }
  normalized = normalize_bindings_payload(payload, "line")
  assert normalized == [
    {"role": "x", "field": "stat_date"},
    {"role": "y", "field": "alarm_count"},
    {"role": "y2", "field": "ticket_count"},
  ]


def test_normalize_bindings_payload_maps_category_value_aliases_for_bar():
  payload = [
    {"role": "category", "field": "region_name"},
    {"role": "series", "field": "severity_level"},
    {"role": "value", "field": "alarm_count"},
  ]
  normalized = normalize_bindings_payload(payload, "bar")
  assert normalized == [
    {"role": "x", "field": "region_name"},
    {"role": "series", "field": "severity_level"},
    {"role": "y", "field": "alarm_count"},
  ]
