"""Arena-styled HTML/PDF research reports for completed Agent tasks."""

from __future__ import annotations

import html
import json
import logging
from typing import Any, Optional

import markdown as markdown_lib

from arena.db_models import AgentTask

logger = logging.getLogger(__name__)

_DIMS = [
    ("Research Depth", "research_depth"),
    ("Logical Soundness", "logical_soundness"),
    ("Consensus Level", "consensus_level"),
    ("Answer Durability", "answer_durability"),
]


def _json_val(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def _sources_list(row: AgentTask) -> list[dict[str, Any]]:
    raw = _json_val(row.sources_used)
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for s in raw:
        if isinstance(s, dict):
            title = s.get("title") or s.get("url") or s.get("name") or str(s)
            out.append({"title": str(title)})
        else:
            out.append({"title": str(s)})
    return out


def _intel_dict(row: AgentTask) -> dict[str, Any]:
    v = _json_val(row.intelligence_score)
    return v if isinstance(v, dict) else {}


def _insight_dict(row: AgentTask) -> dict[str, Any]:
    v = _json_val(row.insight_report)
    return v if isinstance(v, dict) else {}


def _sentences_from_answer(final_answer: str) -> list[dict[str, Any]]:
    if not (final_answer or "").strip():
        return []
    try:
        data = json.loads(final_answer)
        if isinstance(data, dict) and isinstance(data.get("sentences"), list):
            return [s for s in data["sentences"] if isinstance(s, dict)]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def build_report_context_from_row(
    row: AgentTask,
    overlay: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Merge DB row with optional in-memory blackboard fields (caveats, steelman, etc.)."""
    overlay = overlay or {}
    intel = _intel_dict(row)
    if overlay.get("intelligence_score"):
        intel = {**intel, **overlay["intelligence_score"]}

    sentences = overlay.get("sentences")
    if sentences is None:
        sentences = _sentences_from_answer(row.final_answer or "")

    sources = overlay.get("sources")
    if sources is None:
        sources = _sources_list(row)

    caveats = overlay.get("caveats")
    if caveats is None:
        caveats = []

    steelman = overlay.get("steelman")
    if steelman is None:
        steelman = {}

    assumptions = overlay.get("assumptions")
    if assumptions is None:
        assumptions = {}

    temporal = overlay.get("temporal_profile") or {}
    if not temporal.get("decay_class"):
        dur = intel.get("answer_durability")
        if isinstance(dur, dict) and dur.get("label"):
            temporal = {"decay_class": str(dur.get("label") or "").lower().replace(" ", "_")}

    question = (row.task_text or "").strip() or "Research task"
    final_answer_plain = row.final_answer or ""
    if not sentences:
        try:
            p = json.loads(final_answer_plain)
            if isinstance(p, dict) and p.get("sentences"):
                final_answer_plain = " ".join(
                    str(s.get("text", "")) for s in p["sentences"] if isinstance(s, dict)
                )
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        "question": question,
        "created_at": row.created_at,
        "temporal": temporal,
        "sentences": sentences,
        "final_answer_plain": final_answer_plain,
        "intel": intel,
        "steelman": steelman if isinstance(steelman, dict) else {},
        "sources": sources if isinstance(sources, list) else [],
        "caveats": caveats if isinstance(caveats, list) else [],
        "assumptions": assumptions if isinstance(assumptions, dict) else {},
    }


# Tags + URL schemes that we strip from rendered markdown output. The
# markdown library's default mode allows raw HTML, so a final_answer
# produced by an LLM under prompt-injection (or a benign model
# misfire) could include <script>, <iframe>, javascript: links, or
# on* event handlers. WeasyPrint (the PDF path) ignores scripts, but
# write_pdf_or_html falls back to raw text/html when WeasyPrint
# fails — the file is downloaded as report.html with
# Content-Disposition: attachment, and a user who opens it in a
# browser would execute any embedded payload (self-XSS on the
# user's own report, low severity, but a free fix).
_DANGEROUS_TAG_NAMES = frozenset({
    "script", "iframe", "object", "embed", "applet", "frame", "frameset",
    "base", "form", "input", "button", "textarea", "select",
    "style", "link", "meta",
})
# Void elements per the HTML5 spec — the parser does not emit an
# end tag for these, so we must drop them on the starttag callback
# without entering a skip-depth region.
_VOID_DANGEROUS_TAGS = frozenset({"embed", "input", "link", "meta", "base"})
_DANGEROUS_ATTR_PREFIXES = ("on",)
_DANGEROUS_URL_SCHEMES = frozenset({
    "javascript:", "vbscript:", "data:text/html", "data:application/xhtml",
})


def _strip_dangerous_html(html_str: str) -> str:
    """Post-process rendered markdown to remove active content.

    Uses the stdlib html.parser so we don't pull in bleach/nh3. The
    pass is intentionally conservative: it never re-emits a tag we
    don't recognize as safe, and it never re-emits an attribute whose
    value starts with a dangerous URL scheme. The two known false
    positives — inline math using <script type="math/tex"> and CSS in
    <style> — are not in the answer-md surface (this sanitizer only
    touches the agent's free-form answer text, not the document
    shell), so stripping them is the right call.
    """
    import re
    from html.parser import HTMLParser

    # Fast path: if none of the dangerous tokens are present at all
    # (the common case for a well-behaved LLM answer), skip the parse
    # entirely and return the original string.
    if not any(tok in html_str for tok in (
        "<script", "<iframe", "<object", "<embed", "<style",
        "<form", "<base", "<link", "<meta", "javascript:", "vbscript:",
        " onerror=", " onload=", " onclick=", " onmouseover=",
    )):
        return html_str

    dangerous_tags = _DANGEROUS_TAG_NAMES
    void_dangerous_tags = _VOID_DANGEROUS_TAGS
    dangerous_attr_prefixes = _DANGEROUS_ATTR_PREFIXES
    dangerous_url_schemes = _DANGEROUS_URL_SCHEMES

    # Compile the dangerous-attribute regex once. Matches any attribute
    # whose name starts with one of the prefixes (currently just "on")
    # or whose value starts with a dangerous URL scheme.
    attr_re = re.compile(
        r'\s+(on[a-z]+|'
        + "|".join(re.escape(s) for s in sorted(dangerous_url_schemes))
        + r')="[^"]*"',
        re.IGNORECASE,
    )
    # Match href/src that start with a dangerous scheme (with or
    # without quotes, =).
    href_re = re.compile(
        r'\s+(href|src)\s*=\s*["\']?\s*('
        + "|".join(re.escape(s) for s in sorted(dangerous_url_schemes))
        + r")[^\"'\s>]*",
        re.IGNORECASE,
    )

    class _Scrubber(HTMLParser):
        def __init__(self) -> None:
            super().__init__(convert_charrefs=True)
            self._skip_depth = 0
            self._out: list[str] = []

        def _attrs(self, attrs: list[tuple[str, Optional[str]]]) -> list[tuple[str, Optional[str]]]:
            cleaned: list[tuple[str, Optional[str]]] = []
            for name, value in attrs:
                if name is None:
                    continue
                lname = name.lower()
                if lname.startswith(dangerous_attr_prefixes):
                    continue
                if value is None:
                    cleaned.append((name, value))
                    continue
                lval = value.lstrip().lower()
                if any(lval.startswith(scheme) for scheme in dangerous_url_schemes):
                    continue
                cleaned.append((name, value))
            return cleaned

        def _format_attr(self, name: str, value: Optional[str]) -> str:
            if value is None:
                return f" {name}"
            return f' {name}="{html.escape(value, quote=True)}"'

        def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
            ltag = tag.lower()
            # Void dangerous elements (embed, input, link, meta, base):
            # the parser will not send a matching end tag, so dropping
            # them on the starttag callback is the only correct path.
            if ltag in void_dangerous_tags:
                return
            # Non-void dangerous elements: enter skip mode so the
            # parser's end tag (and any inner content) is also dropped.
            if self._skip_depth > 0 or ltag in dangerous_tags:
                self._skip_depth += 1
                return
            cleaned = self._attrs(attrs)
            self._out.append(
                f"<{ltag}{''.join(self._format_attr(n, v) for n, v in cleaned)}>"
            )

        def handle_endtag(self, tag: str) -> None:
            ltag = tag.lower()
            if ltag in dangerous_tags and ltag not in void_dangerous_tags:
                # Match the starttag's skip-depth increment for
                # non-void dangerous elements.
                if self._skip_depth > 0:
                    self._skip_depth -= 1
                return
            if self._skip_depth > 0:
                return
            self._out.append(f"</{ltag}>")

        def handle_startendtag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
            ltag = tag.lower()
            if self._skip_depth > 0 or ltag in dangerous_tags:
                return
            cleaned = self._attrs(attrs)
            self._out.append(
                f"<{ltag}{''.join(self._format_attr(n, v) for n, v in cleaned)}/>"
            )

        def handle_data(self, data: str) -> None:
            if self._skip_depth > 0:
                return
            self._out.append(html.escape(data, quote=False))

        def get_data(self) -> str:
            return "".join(self._out)

    scrubber = _Scrubber()
    try:
        scrubber.feed(html_str)
        scrubber.close()
        result = scrubber.get_data()
    except Exception:
        # If the parser itself fails (malformed HTML), fall back to a
        # regex-only scrub. This is the worst-case path: strip known
        # dangerous tags + on* handlers + dangerous URL schemes.
        logger.warning("HTML parser failed during markdown scrub, falling back to regex", exc_info=True)
        result = html_str
        # Remove dangerous open + close tags and their content.
        for tag in ("script", "iframe", "object", "embed", "style", "form", "base"):
            result = re.sub(
                rf"<{tag}\b[^>]*>.*?</{tag}>",
                "",
                result,
                flags=re.IGNORECASE | re.DOTALL,
            )
            result = re.sub(
                rf"<{tag}\b[^>]*/?>",
                "",
                result,
                flags=re.IGNORECASE,
            )
        result = attr_re.sub("", result)
        result = href_re.sub("", result)

    return result


def _markdown_answer_html(plain: str) -> str:
    raw = (plain or "").strip()
    if not raw:
        return ""
    try:
        body = markdown_lib.markdown(raw, extensions=["tables", "fenced_code"])
    except Exception:
        logger.warning("Failed to render markdown, returning escaped plain text", exc_info=True)
        return f"<p>{html.escape(raw)}</p>"
    safe_body = _strip_dangerous_html(body)
    return f'<div class="answer-md">{safe_body}</div>'


def _answer_html(ctx: dict[str, Any]) -> str:
    sentences = ctx.get("sentences") or []
    if sentences:
        parts = []
        for s in sentences:
            conf = str(s.get("confidence") or "supported").lower()
            if conf == "verified":
                color = "#2D6A0A"
            elif conf == "supported":
                color = "#8B5A00"
            else:
                color = "#C0392B"
            parts.append(f'<span style="color:{color}">{html.escape(str(s.get("text", "")))}</span>')
        return " ".join(parts)
    return _markdown_answer_html(str(ctx.get("final_answer_plain") or ""))


def _task_body_inner(ctx: dict[str, Any]) -> str:
    intel = ctx.get("intel") or {}
    temporal = ctx.get("temporal") or {}
    badge = str(temporal.get("decay_class") or "research").upper().replace("_", " ")
    created = ctx["created_at"]
    created_s = created.strftime("%B %d, %Y") if created else ""

    total = intel.get("total_score", "—")
    verdict = html.escape(str(intel.get("one_line_verdict") or ""))

    dim_rows = []
    for label, key in _DIMS:
        block = intel.get(key)
        score = "—"
        if isinstance(block, dict) and block.get("score") is not None:
            score = block.get("score")
        dim_rows.append(
            f'<div class="dim"><span>{html.escape(label)}</span>'
            f'<span>{html.escape(str(score))}/25</span></div>'
        )

    steelman = ctx.get("steelman") or {}
    opp = str(steelman.get("opposing_position") or "").strip()
    steelman_html = ""
    if opp:
        steelman_html = (
            f"<h2>Steelman</h2><div class=\"steelman\">{html.escape(opp)}</div>"
        )

    sources = ctx.get("sources") or []
    sources_html = ""
    if sources:
        lines = []
        for i, s in enumerate(sources):
            t = s.get("title", "") if isinstance(s, dict) else str(s)
            lines.append(f'<div class="source"><b>{i + 1:02d}</b> {html.escape(str(t))}</div>')
        sources_html = "<h2>Sources</h2>" + "".join(lines)

    caveats = ctx.get("caveats") or []
    caveats_html = ""
    if caveats:
        lines = []
        for c in caveats:
            if not isinstance(c, dict):
                continue
            kw = html.escape(str(c.get("keyword") or c.get("category") or "Note"))
            desc = html.escape(str(c.get("description") or c.get("text") or ""))
            lines.append(f'<div class="caveat"><b>{kw}</b> — {desc}</div>')
        caveats_html = "<h2>Analytical Caveats</h2>" + "".join(lines)

    assumptions = ctx.get("assumptions") or {}
    summ = str(assumptions.get("summary") or "").strip()
    assum_html = ""
    if summ:
        assum_html = (
            f"<h2>Key Assumptions</h2><p style=\"font-size:12px;color:#A89070;"
            f'font-style:italic;">{html.escape(summ)}</p>'
        )

    answer_html = _answer_html(ctx)
    foot_ts = created.strftime("%Y-%m-%d %H:%M") if created else ""

    return f"""
<div class="meta">
  Arena Agent · {html.escape(created_s)}
  &nbsp;·&nbsp;
  <span class="badge">{html.escape(badge)}</span>
</div>
<h1>{html.escape(ctx.get("question") or "")}</h1>
<h2>Answer</h2>
<div class="answer">{answer_html}</div>
<h2>Intelligence Score</h2>
<div class="intel-score">{html.escape(str(total))}/100</div>
<p style="font-size:12px;color:#8C7355;font-style:italic;">{verdict}</p>
{"".join(dim_rows)}
{steelman_html}
{sources_html}
{caveats_html}
{assum_html}
<div class="footer">
  Generated by Arena · {html.escape(foot_ts)} UTC ·
  Intelligence Score: {html.escape(str(total))}/100
</div>
"""


def _document_shell(inner_body: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{{font-family:Georgia,serif;color:#2C1810;
    background:#F5F0E8;padding:48px;max-width:800px;
    margin:0 auto;font-size:14px;line-height:1.7;}}
  h1{{font-size:28px;font-weight:500;margin-bottom:4px;}}
  h2{{font-size:13px;letter-spacing:0.16em;
    text-transform:uppercase;color:#C4A882;
    margin:28px 0 10px;border-bottom:0.5px solid
    #E0D5C5;padding-bottom:6px;}}
  .meta{{font-size:12px;color:#A89070;margin-bottom:32px;}}
  .answer{{font-size:15px;line-height:1.82;
    margin-bottom:24px;}}
  .intel-score{{font-size:42px;font-weight:500;
    color:#2C1810;}}
  .dim{{display:flex;justify-content:space-between;
    font-size:12px;color:#8C7355;margin-bottom:4px;}}
  .source{{font-size:12px;color:#4A3728;
    margin-bottom:6px;}}
  .caveat{{background:#FDFAF6;border-left:3px solid
    #C4956A;padding:8px 12px;margin-bottom:8px;
    font-size:12px;}}
  .steelman{{border-left:3px solid #8C7355;
    padding:10px 14px;font-style:italic;
    font-size:13px;color:#4A3728;}}
  .footer{{margin-top:48px;font-size:11px;
    color:#C4A882;border-top:0.5px solid #E0D5C5;
    padding-top:12px;}}
  .badge{{display:inline-block;font-size:10px;
    letter-spacing:0.10em;text-transform:uppercase;
    padding:2px 8px;border-radius:8px;
    background:#F0E8DC;color:#8C7355;}}
  .orch-header{{background:#2C1810;color:#C4956A;padding:16px 20px;
    margin:-48px -48px 32px -48px;font-size:14px;}}
  .orch-badge{{display:inline-block;margin-left:10px;font-size:11px;
    padding:2px 10px;border-radius:999px;background:rgba(196,149,106,0.25);}}
  .synthesis-block{{font-size:15px;line-height:1.8;margin-bottom:20px;}}
  .conflict-box{{border-left:3px solid #E8C87A;padding:10px 14px;margin-bottom:10px;
    background:#FDF6EC;font-size:13px;color:#4A3728;}}
  .answer-md h1{{font-size:22px;font-weight:500;margin:18px 0 10px;color:#2C1810;}}
  .answer-md h2{{font-size:17px;font-weight:500;margin:16px 0 8px;padding-bottom:6px;
    border-bottom:0.5px solid #E0D5C5;color:#2C1810;}}
  .answer-md h3{{font-size:15px;font-weight:500;margin:14px 0 6px;color:#4A3728;}}
  .answer-md p{{margin:0 0 12px;line-height:1.82;}}
  .answer-md ul,.answer-md ol{{margin:0 0 12px;padding-left:22px;}}
  .answer-md blockquote{{border-left:3px solid #C4956A;padding-left:14px;margin:12px 0;
    color:#6B5040;font-style:italic;}}
  .answer-md pre{{background:#F5EFE6;border:0.5px solid #E0D5C5;border-radius:8px;
    padding:12px 14px;overflow-x:auto;font-size:13px;}}
  .answer-md table{{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;}}
  .answer-md th,.answer-md td{{border:0.5px solid #E0D5C5;padding:6px 10px;text-align:left;}}
  .answer-md th{{background:#F0E8DC;}}
</style></head><body>
{inner_body}
</body></html>"""


def generate_report_html(task: AgentTask, overlay: Optional[dict[str, Any]] = None) -> str:
    """Full HTML document for one task (PDF or print)."""
    ctx = build_report_context_from_row(task, overlay)
    return _document_shell(_task_body_inner(ctx))


def generate_synthesis_section_html(
    synthesis: str,
    bullets: list[str],
    conflicts: list[dict[str, Any]],
    n_tasks: int,
) -> str:
    bull_lines = "".join(f"<li>{html.escape(b)}</li>" for b in bullets if str(b).strip())
    bull_html = f"<ul style='margin:12px 0;padding-left:22px;'>{bull_lines}</ul>" if bull_lines else ""

    conf_html = ""
    if conflicts:
        parts = []
        for c in conflicts:
            if not isinstance(c, dict):
                continue
            ta = c.get("task_a", "?")
            tb = c.get("task_b", "?")
            txt = html.escape(str(c.get("conflict") or ""))
            parts.append(
                f'<div class="conflict-box"><b>Task {ta} vs Task {tb}</b><br/>{txt}</div>'
            )
        if parts:
            conf_html = "<h2>Where tasks disagreed</h2>" + "".join(parts)

    syn = html.escape(str(synthesis or ""))
    return f"""
<div class="orch-header">
  <strong>Unified synthesis</strong>
  <span class="orch-badge">{n_tasks} tasks combined</span>
</div>
<div class="synthesis-block">{syn.replace(chr(10), '<br/>')}</div>
{bull_html}
{conf_html}
"""


def generate_orchestration_report_html(
    synthesis: str,
    bullets: list[str],
    conflicts: list[dict[str, Any]],
    task_rows: list[AgentTask],
    overlays: Optional[list[Optional[dict[str, Any]]]] = None,
) -> str:
    """Single HTML document: synthesis first, then each task on a new page."""
    overlays = overlays or [None] * len(task_rows)
    parts = [
        generate_synthesis_section_html(synthesis, bullets, conflicts, len(task_rows)),
    ]
    for i, row in enumerate(task_rows):
        ov = overlays[i] if i < len(overlays) else None
        inner = _task_body_inner(build_report_context_from_row(row, ov))
        parts.append(
            f'<div style="page-break-before:always;"><h2 style="margin-top:0;">Task {i + 1}</h2>{inner}</div>'
        )
    return _document_shell("".join(parts))


def write_pdf_or_html(html_string: str, base_filename: str) -> tuple[bytes, str, str]:
    """
    Try WeasyPrint PDF; on any failure return UTF-8 HTML bytes for attachment.
    Returns (content_bytes, media_type, filename_ext_without_dot_for_pdf_or_html).
    """
    try:
        from weasyprint import HTML

        pdf = HTML(string=html_string).write_pdf()
        return pdf, "application/pdf", "pdf"
    except Exception as e:
        logger.warning("WeasyPrint PDF failed, falling back to HTML: %s", e)
        return html_string.encode("utf-8"), "text/html; charset=utf-8", "html"
