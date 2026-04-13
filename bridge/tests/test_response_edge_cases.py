"""Additional response truncation tests — edge cases for ! and ? boundaries."""

from g2_bridge.response import truncate_response


def test_truncate_at_exclamation_mark():
    text = "Wow! This is great! And more! Extra stuff here."
    result = truncate_response(text, 30)
    assert result.endswith("...")
    assert "Wow!" in result
    assert "Extra" not in result


def test_truncate_at_question_mark():
    text = "How are you? I am fine. What about you? More text."
    result = truncate_response(text, 35)
    assert result.endswith("...")
    assert "How are you?" in result or "What about you?" in result
    assert "More text" not in result


def test_truncate_at_last_sentence_boundary():
    """Should cut at the LAST sentence boundary within the limit."""
    text = "First sentence. Second sentence. Third sentence. Fourth sentence here."
    # With limit 45, "Third sentence." is at pos 43-44 but the ". " regex needs
    # both dot AND space within the truncated portion. text[:45] = "Third senten"
    # so the last ". " within limit is at position 31 ("Second sentence.")
    result = truncate_response(text, 45)
    assert result.endswith("...")
    assert "Second sentence" in result
    assert "Third" not in result


def test_truncate_no_space_just_punctuation():
    text = "a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z"
    result = truncate_response(text, 10)
    assert result.endswith("...")
    assert len(result) <= 13  # 10 + "..."


def test_truncate_single_long_word():
    text = "supercalifragilisticexpialidocious"
    result = truncate_response(text, 10)
    assert result.endswith("...")
    assert len(result) == 13  # hard cut


def test_truncate_with_newlines():
    text = "Line one.\nLine two.\nLine three.\nLine four."
    result = truncate_response(text, 20)
    assert result.endswith("...")


def test_truncate_max_chars_one():
    text = "Hello world"
    result = truncate_response(text, 1)
    assert result == "H..."


def test_truncate_preserves_content_under_limit():
    text = "Short"
    result = truncate_response(text, 500)
    assert result == "Short"
    assert not result.endswith("...")


def test_truncate_space_too_far_back():
    """If the last space is before half the limit, should hard-cut instead."""
    text = "a" * 90 + " " + "b" * 10
    result = truncate_response(text, 95)
    assert result.endswith("...")
    # The space is at position 90, which is > 95//2 = 47, so it should cut at space
    assert " " not in result.rstrip(".")
