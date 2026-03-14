from app.scenes.command_plan.service import infer_commands_from_input, merge_command_lists, normalize_plan_payload, supplement_plan_from_request


def test_normalize_plan_payload_converts_string_commands():
  plan = normalize_plan_payload(
    {
      "intent": "change_chart",
      "targets": ["chart_ops_alarm"],
      "commands": ["set_chart_type('bar')", "enable_labels(true)"],
      "explain": "切换柱状图并显示标签",
    },
    "chart_ops_alarm",
  )
  assert plan is not None
  assert plan["commands"] == [
    {"type": "UpdateProps", "nodeId": "chart_ops_alarm", "props": {"chartType": "bar"}},
    {"type": "UpdateProps", "nodeId": "chart_ops_alarm", "props": {"labelShow": True}},
  ]


def test_normalize_plan_payload_converts_action_commands():
  plan = normalize_plan_payload(
    {
      "intent": "change_chart",
      "targets": ["chart_capacity_trend"],
      "commands": [
        {"action": "set_chart_type", "params": {"type": "line"}},
        {"action": "toggle_smooth", "params": {"enabled": True}},
      ],
      "explain": "改折线并平滑",
    },
    "chart_capacity_trend",
  )
  assert plan is not None
  assert plan["commands"] == [
    {"type": "UpdateProps", "nodeId": "chart_capacity_trend", "props": {"chartType": "line"}},
    {"type": "UpdateProps", "nodeId": "chart_capacity_trend", "props": {"smooth": True}},
  ]


def test_normalize_plan_payload_converts_update_visualization():
  plan = normalize_plan_payload(
    {
      "intent": "update_visualization",
      "targets": ["chart_region_compare"],
      "commands": [
        {
          "action": "update_visualization",
          "params": {
            "nodeId": "chart_region_compare",
            "chartType": "pie",
            "showLabels": True,
            "showPercentages": True,
          },
        }
      ],
      "explain": "切到饼图看占比",
    },
    "chart_region_compare",
  )
  assert plan is not None
  assert plan["commands"] == [
    {"type": "UpdateProps", "nodeId": "chart_region_compare", "props": {"chartType": "pie", "labelShow": True}}
  ]


def test_supplement_plan_from_request_adds_missing_label_command():
  plan = supplement_plan_from_request(
    {
      "intent": "change_theme",
      "targets": ["chart_alarm_trend"],
      "commands": [{"type": "ApplyTheme", "scope": "doc", "themeId": "theme.tech.dark"}],
      "explain": "切暗色主题",
    },
    "整体换成暗色主题，顺便把当前图表标签打开",
    "chart_alarm_trend",
  )
  assert plan is not None
  assert {"type": "ApplyTheme", "scope": "doc", "themeId": "theme.tech.dark"} in plan["commands"]
  assert {"type": "UpdateProps", "nodeId": "chart_alarm_trend", "props": {"labelShow": True}} in plan["commands"]


def test_infer_commands_from_input_recognizes_composite_intent():
  commands = infer_commands_from_input("把这张容量趋势图改成折线图，打开平滑和标签", "chart_capacity_trend")
  assert commands == [
    {"type": "UpdateProps", "nodeId": "chart_capacity_trend", "props": {"chartType": "line"}},
    {"type": "UpdateProps", "nodeId": "chart_capacity_trend", "props": {"smooth": True}},
    {"type": "UpdateProps", "nodeId": "chart_capacity_trend", "props": {"labelShow": True}},
  ]


def test_infer_commands_from_input_falls_back_for_optimize_intent():
  commands = infer_commands_from_input("帮我优化一下这个图", "chart_service_health")
  assert commands == [
    {"type": "UpdateProps", "nodeId": "chart_service_health", "props": {"smooth": True}}
  ]


def test_merge_command_lists_deduplicates_commands():
  merged = merge_command_lists(
    [{"type": "ApplyTheme", "scope": "doc", "themeId": "theme.tech.dark"}],
    [
      {"type": "ApplyTheme", "scope": "doc", "themeId": "theme.tech.dark"},
      {"type": "UpdateProps", "nodeId": "chart_1", "props": {"labelShow": True}},
    ],
  )
  assert merged == [
    {"type": "ApplyTheme", "scope": "doc", "themeId": "theme.tech.dark"},
    {"type": "UpdateProps", "nodeId": "chart_1", "props": {"labelShow": True}},
  ]


def test_normalize_plan_payload_handles_optimize_alias_commands():
  plan = normalize_plan_payload(
    {
      "intent": "optimize_visualization",
      "targets": ["chart_service_health"],
      "commands": ["auto_optimize_layout", "enhance_color_contrast", "simplify_labels"],
      "explain": "优化一下这个图",
    },
    "chart_service_health",
  )
  assert plan is not None
  assert plan["commands"] == [
    {"type": "UpdateProps", "nodeId": "chart_service_health", "props": {"smooth": True, "labelShow": True}},
    {
      "type": "UpdateProps",
      "nodeId": "chart_service_health",
      "props": {"themeRef": "theme.tech.dark", "paletteRef": "palette.tech.dark"},
    },
    {"type": "UpdateProps", "nodeId": "chart_service_health", "props": {"labelShow": True}},
  ]
