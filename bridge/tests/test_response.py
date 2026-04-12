"""Response truncation tests."""

from g2_bridge.response import truncate_response


def test_short_text_unchanged():
    assert truncate_response("Hello!", 500) == "Hello!"


def test_exact_limit_unchanged():
    text = "a" * 500
    assert truncate_response(text, 500) == text


def test_truncate_at_sentence_boundary():
    text = "First sentence. Second sentence. Third sentence. Fourth sentence here."
    result = truncate_response(text, 40)
    assert result.endswith("...")
    assert "Third" not in result


def test_truncate_at_space():
    text = "Word1 word2 word3 word4 word5"
    result = truncate_response(text, 15)
    assert result.endswith("...")
    # Should cut at a space, not mid-word
    assert " " in result.rstrip(".").rstrip(".").rstrip(".")


def test_hard_cut_when_no_boundary():
    text = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    result = truncate_response(text, 20)
    assert result.endswith("...")
    assert len(result) == 23  # 20 chars + "..."


def test_custom_max_chars():
    text = "A" * 200
    result = truncate_response(text, 100)
    assert len(result) == 103  # 100 + "..."


def test_empty_string():
    assert truncate_response("", 500) == ""
