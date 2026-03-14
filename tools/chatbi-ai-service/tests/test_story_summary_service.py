from app.scenes.story_summary.service import normalize_string_list


def test_normalize_string_list_splits_paragraph_text():
  assert normalize_string_list("先看结论；再看证据。最后给建议") == ["先看结论", "再看证据", "最后给建议"]
