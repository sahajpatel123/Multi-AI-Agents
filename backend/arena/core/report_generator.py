"""Arena-styled HTML/PDF research reports for completed Agent tasks."""

from __future__ import annotations

import csv
import html
import io
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


def _md_inline(value: Any) -> str:
    """Escape a short text value for inline markdown use.

    Titles, keywords, and other short strings come from LLM-produced
    reports, so they may contain markdown metacharacters. Escaping keeps
    a single misbehaving source from breaking the document structure or
    rendering as clickable/link content in the exported file.
    Newlines are flattened to spaces (these fields are inline, not block
    content) and HTML metacharacters are entity-escaped so raw `<script>`
    or similar payloads render as literal text instead of active HTML in
    markdown previewers that allow raw HTML.
    """
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("\r\n", " ")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("*", "\\*")
        .replace("_", "\\_")
        .replace("`", "\\`")
        .replace("[", "\\[")
        .replace("]", "\\]")
    )


def _md_block(value: Any) -> str:
    """Escape raw HTML in a Markdown block while preserving Markdown syntax.

    Synthesis text is LLM-produced and may legitimately contain headings,
    lists, code fences, or links, so flattening it through ``_md_inline``
    would make the report much less useful. Escaping only HTML
    metacharacters keeps that Markdown structure intact while ensuring raw
    tags and event handlers render as text in previewers that allow HTML.
    """
    return html.escape(str(value), quote=False)


def _score_text(value: Any) -> str:
    """Render a numeric score without float noise; missing values become '—'."""
    if value is None or isinstance(value, bool):
        return "—"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value: Any) -> str:
    """Return ``value`` as a string safe to embed in a CSV cell.

    Defense-in-depth against CSV injection (CWE-1236): a value whose first
    character (after the leading whitespace spreadsheets ignore when deciding
    whether to evaluate a formula) is a formula trigger gets a leading
    apostrophe. The apostrophe is invisible in Excel and prevents the cell
    from being parsed as a formula.
    """
    s = str(value) if value is not None else ""
    first_significant = s.lstrip()[:1]
    if first_significant and first_significant in _CSV_FORMULA_PREFIXES:
        return "'" + s
    return s


def _csv_join_list(values: Any) -> str:
    """Join list-shaped overlay fields into a single readable CSV cell."""
    if not isinstance(values, list):
        return ""
    return "; ".join(
        str(v) for v in values if str(v).strip()
    )


def _add_csv_row(
    rows: list[tuple[str, str, str, str]],
    task_id: str,
    section: str,
    key: str,
    value: Any,
) -> None:
    """Append one normalized CSV report row (values are sanitized on write)."""
    rows.append((task_id, section, key, str(value) if value is not None else ""))


def generate_report_csv(
    task: AgentTask, overlay: Optional[dict[str, Any]] = None
) -> str:
    """Portable CSV research report for a completed Agent task.

    Emits a normalized ``task_id, section, key, value`` sheet so the report
    stays spreadsheet-friendly (filter by section, pivot on key) instead of
    cramming the entire answer into one giant cell. It carries the same
    report context as the markdown export: question, answer, intelligence
    score, sources, steelman, caveats, assumptions, source integrity, dissent,
    and temporal profile.
    """
    ctx = build_report_context_from_row(task, overlay)
    overlay = overlay or {}

    task_id = str(task.task_id or "")
    question = str(ctx.get("question") or "Research task").strip()
    answer = str(ctx.get("final_answer_plain") or "").strip()
    if not answer:
        answer = str(task.final_answer or "").strip()
    intel = ctx.get("intel") or {}
    temporal = ctx.get("temporal") or {}
    created = ctx.get("created_at")
    created_s = created.strftime("%Y-%m-%dT%H:%M:%SZ") if created else ""

    rows: list[tuple[str, str, str, str]] = []

    _add_csv_row(rows, task_id, "metadata", "question", question)
    _add_csv_row(rows, task_id, "metadata", "answer", answer)
    _add_csv_row(
        rows,
        task_id,
        "metadata",
        "score",
        _score_text(intel.get("total_score")),
    )
    _add_csv_row(
        rows,
        task_id,
        "metadata",
        "confidence",
        task.final_confidence if task.final_confidence is not None else "",
    )
    _add_csv_row(rows, task_id, "metadata", "created_at", created_s)

    _add_csv_row(
        rows,
        task_id,
        "intelligence",
        "one_line_verdict",
        intel.get("one_line_verdict"),
    )
    for label, key in _DIMS:
        block = intel.get(key)
        score = "—"
        if isinstance(block, dict) and block.get("score") is not None:
            score = _score_text(block.get("score"))
        _add_csv_row(rows, task_id, "intelligence", key, score)

    sources = ctx.get("sources") or []
    for i, s in enumerate(sources, 1):
        if isinstance(s, dict):
            title = s.get("title") or s.get("url") or s.get("name")
        else:
            title = str(s)
        title = str(title).strip() or "Untitled source"
        _add_csv_row(rows, task_id, "sources", f"source {i}", title)

    steelman = ctx.get("steelman") or {}
    if isinstance(steelman, dict):
        _add_csv_row(
            rows,
            task_id,
            "steelman",
            "opposing_position",
            steelman.get("opposing_position"),
        )
        _add_csv_row(
            rows,
            task_id,
            "steelman",
            "key_arguments",
            _csv_join_list(steelman.get("key_arguments")),
        )
        _add_csv_row(
            rows,
            task_id,
            "steelman",
            "strongest_evidence",
            steelman.get("strongest_evidence"),
        )
        _add_csv_row(
            rows,
            task_id,
            "steelman",
            "concession",
            steelman.get("concession"),
        )

    caveats = ctx.get("caveats") or []
    for c in caveats:
        if not isinstance(c, dict):
            continue
        keyword = str(c.get("keyword") or c.get("category") or "Note")
        desc = str(c.get("description") or c.get("text") or "")
        _add_csv_row(rows, task_id, "caveats", keyword, desc)

    assumptions = ctx.get("assumptions") or {}
    if isinstance(assumptions, dict):
        _add_csv_row(
            rows,
            task_id,
            "assumptions",
            "summary",
            assumptions.get("summary"),
        )
        items = assumptions.get("assumptions")
        if isinstance(items, list):
            for i, item in enumerate(items, 1):
                if not isinstance(item, dict):
                    continue
                text = str(item.get("assumption") or "").strip()
                if not text:
                    continue
                criticality = str(item.get("criticality") or "").strip()
                flag = item.get("flag")
                suffix = ""
                if criticality:
                    suffix += f" (criticality: {criticality}"
                    if flag is not None:
                        suffix += f", flag: {flag}"
                    suffix += ")"
                _add_csv_row(
                    rows,
                    task_id,
                    "assumptions",
                    f"assumption {i}",
                    text + suffix,
                )

    source_integrity = overlay.get("source_integrity") or {}
    if isinstance(source_integrity, dict):
        _add_csv_row(
            rows,
            task_id,
            "source_integrity",
            "summary",
            source_integrity.get("summary"),
        )
        _add_csv_row(
            rows,
            task_id,
            "source_integrity",
            "integrity_label",
            source_integrity.get("integrity_label"),
        )
        _add_csv_row(
            rows,
            task_id,
            "source_integrity",
            "source_count",
            source_integrity.get("source_count"),
        )
        _add_csv_row(
            rows,
            task_id,
            "source_integrity",
            "overall_source_integrity",
            source_integrity.get("overall_source_integrity"),
        )
        claims = source_integrity.get("claims")
        if isinstance(claims, list):
            for i, claim in enumerate(claims, 1):
                if not isinstance(claim, dict):
                    continue
                text = str(claim.get("claim") or "").strip()
                if not text:
                    continue
                confidence = claim.get("agreement_confidence")
                value = text
                if confidence is not None:
                    value += f" (confidence: {confidence})"
                _add_csv_row(
                    rows,
                    task_id,
                    "source_integrity",
                    f"claim {i}",
                    value,
                )

    dissent = overlay.get("dissent_report") or {}
    if isinstance(dissent, dict):
        positions = dissent.get("positions")
        if isinstance(positions, list):
            for pos in positions:
                if not isinstance(pos, dict):
                    continue
                label = str(pos.get("label") or "").strip()
                if not label:
                    continue
                _add_csv_row(
                    rows,
                    task_id,
                    "dissent",
                    f"position {label}",
                    pos.get("count") if pos.get("count") is not None else "",
                )
        _add_csv_row(
            rows,
            task_id,
            "dissent",
            "minority_view_summary",
            dissent.get("minority_view_summary"),
        )

    if isinstance(temporal, dict):
        _add_csv_row(
            rows,
            task_id,
            "temporal_profile",
            "decay_class",
            temporal.get("decay_class"),
        )
        _add_csv_row(
            rows,
            task_id,
            "temporal_profile",
            "half_life",
            temporal.get("half_life"),
        )
        _add_csv_row(
            rows,
            task_id,
            "temporal_profile",
            "recheck_by",
            temporal.get("recheck_by"),
        )
        time_sensitive = temporal.get("time_sensitive_claims")
        if isinstance(time_sensitive, list):
            _add_csv_row(
                rows,
                task_id,
                "temporal_profile",
                "time_sensitive_claims",
                _csv_join_list(time_sensitive),
            )

    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(["task_id", "section", "key", "value"])
    for row in rows:
        writer.writerow([_csv_safe(v) for v in row])
    return buf.getvalue()


def generate_report_markdown(
    task: AgentTask, overlay: Optional[dict[str, Any]] = None
) -> str:
    """Portable markdown research report for a completed Agent task.

    Complements generate_report_html with the same report context
    (question, answer, intelligence score, sources, steelman, caveats,
    assumptions, temporal profile) plus the post-pipeline reports that
    live in the export overlay (dissent report, source integrity).
    The answer body is intentionally left as raw markdown so the file
    reads naturally in any renderer; short metadata values are escaped
    inline so a malformed report cannot hijack the document structure.
    """
    ctx = build_report_context_from_row(task, overlay)
    overlay = overlay or {}

    question = str(ctx.get("question") or "Research task").strip()
    answer = str(ctx.get("final_answer_plain") or "").strip()
    if not answer:
        answer = str(task.final_answer or "").strip()
    intel = ctx.get("intel") or {}
    temporal = ctx.get("temporal") or {}
    created = ctx.get("created_at")
    created_s = created.strftime("%B %d, %Y") if created else ""

    total = _score_text(intel.get("total_score"))
    verdict = str(intel.get("one_line_verdict") or "").strip()

    lines: list[str] = []
    # The H1 is the document's structural anchor, so the question is
    # flattened and inline-escaped there. The body section below keeps
    # the user's original question verbatim.
    lines.append(f"# {_md_inline(question)}")
    lines.append("")
    lines.append("> Arena Agent research report · generated by Arena")
    lines.append("")

    lines.append("## Question")
    lines.append("")
    lines.append(question)
    lines.append("")

    lines.append("## Answer")
    lines.append("")
    if answer:
        lines.append(answer)
    else:
        lines.append("_No answer recorded for this task._")
    lines.append("")

    lines.append("## Intelligence Score")
    lines.append("")
    if verdict:
        lines.append(f"**{total}/100** — {_md_inline(verdict)}")
        lines.append("")
    else:
        lines.append(f"**{total}/100**")
        lines.append("")
    for label, key in _DIMS:
        block = intel.get(key)
        score = "—"
        if isinstance(block, dict) and block.get("score") is not None:
            score = _score_text(block.get("score"))
        lines.append(f"- **{label}:** {score}/25")
    lines.append("")

    sources = ctx.get("sources") or []
    if sources:
        lines.append("## Sources")
        lines.append("")
        for i, s in enumerate(sources, 1):
            if isinstance(s, dict):
                title = s.get("title") or s.get("url") or s.get("name")
            else:
                title = str(s)
            title = str(title).strip() or "Untitled source"
            lines.append(f"{i}. {_md_inline(title)}")
        lines.append("")

    steelman = ctx.get("steelman") or {}
    opposing = str(steelman.get("opposing_position") or "").strip()
    if opposing:
        lines.append("## Steelman")
        lines.append("")
        lines.append(_md_inline(opposing))
        lines.append("")
        arguments = steelman.get("key_arguments")
        if isinstance(arguments, list):
            for arg in arguments:
                if str(arg).strip():
                    lines.append(f"- {_md_inline(arg)}")
            lines.append("")
        evidence = str(steelman.get("strongest_evidence") or "").strip()
        if evidence:
            lines.append(f"**Strongest evidence:** {_md_inline(evidence)}")
            lines.append("")
        concession = str(steelman.get("concession") or "").strip()
        if concession:
            lines.append(f"**Concession:** {_md_inline(concession)}")
            lines.append("")

    caveats = ctx.get("caveats") or []
    if caveats:
        lines.append("## Analytical Caveats")
        lines.append("")
        for c in caveats:
            if not isinstance(c, dict):
                continue
            keyword = str(c.get("keyword") or c.get("category") or "Note")
            desc = str(c.get("description") or c.get("text") or "")
            lines.append(f"- **{_md_inline(keyword)}** — {_md_inline(desc)}")
        lines.append("")

    assumptions = ctx.get("assumptions") or {}
    assumption_summary = str(assumptions.get("summary") or "").strip()
    assumption_items = assumptions.get("assumptions")
    if assumption_summary or isinstance(assumption_items, list) and assumption_items:
        lines.append("## Key Assumptions")
        lines.append("")
        if assumption_summary:
            lines.append(f"_{_md_inline(assumption_summary)}_")
            lines.append("")
        if isinstance(assumption_items, list):
            for item in assumption_items:
                if not isinstance(item, dict):
                    continue
                text = str(item.get("assumption") or "").strip()
                if not text:
                    continue
                criticality = str(item.get("criticality") or "").strip()
                suffix = (
                    f" _(criticality: {_md_inline(criticality)})_"
                    if criticality
                    else ""
                )
                lines.append(f"- {_md_inline(text)}{suffix}")
            lines.append("")

    source_integrity = overlay.get("source_integrity") or {}
    integrity_summary = str(source_integrity.get("summary") or "").strip()
    if integrity_summary:
        lines.append("## Source Integrity")
        lines.append("")
        label = str(source_integrity.get("integrity_label") or "").strip()
        if label:
            lines.append(f"_{_md_inline(label.capitalize())} — {_md_inline(integrity_summary)}_")
        else:
            lines.append(f"_{_md_inline(integrity_summary)}_")
        lines.append("")

    dissent = overlay.get("dissent_report") or {}
    minority_view = str(dissent.get("minority_view_summary") or "").strip()
    positions = dissent.get("positions")
    if minority_view or isinstance(positions, list) and positions:
        lines.append("## Dissent")
        lines.append("")
        if isinstance(positions, list):
            for pos in positions:
                if not isinstance(pos, dict):
                    continue
                label = str(pos.get("label") or "").strip()
                count = pos.get("count")
                if label:
                    if count is None:
                        lines.append(f"- **{_md_inline(label)}**")
                    else:
                        lines.append(
                            f"- **{_md_inline(label)}:** {_score_text(count)}"
                        )
            lines.append("")
        if minority_view:
            lines.append(_md_inline(minority_view))
            lines.append("")

    decay_class = str(temporal.get("decay_class") or "").strip()
    if decay_class:
        lines.append("## Temporal Profile")
        lines.append("")
        lines.append(f"- **Decay class:** {_md_inline(decay_class.replace('_', ' ').capitalize())}")
        half_life = str(temporal.get("half_life") or "").strip()
        if half_life:
            lines.append(f"- **Half-life:** {_md_inline(half_life)}")
        recheck_by = temporal.get("recheck_by")
        if recheck_by:
            lines.append(f"- **Recheck by:** {_md_inline(str(recheck_by))}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(f"_Generated by Arena · {_md_inline(created_s)} UTC_")
    lines.append("")
    return "\n".join(lines)


def _append_orchestration_markdown(
    lines: list[str], item: dict[str, Any], heading: str
) -> None:
    """Append one safely escaped orchestration summary to ``lines``."""
    status = str(item.get("status") or "unknown")
    created_at = str(item.get("created_at") or "")
    task_ids = item.get("task_ids")
    task_ids = task_ids if isinstance(task_ids, list) else []

    lines.extend([heading, "", f"- **Status:** {_md_inline(status)}"])
    if created_at:
        lines.append(f"- **Created:** {_md_inline(created_at)}")
    lines.append(f"- **Tasks:** {len(task_ids)}")
    lines.extend(f"  - {_md_inline(task_id)}" for task_id in task_ids)
    lines.extend(["", "### Synthesis", ""])

    synthesis = _md_block(item.get("synthesis") or "").strip()
    lines.extend([synthesis or "_No synthesis recorded._", ""])

    bullets = item.get("synthesis_bullets")
    bullets = bullets if isinstance(bullets, list) else []
    clean_bullets = [str(b).strip() for b in bullets if str(b).strip()]
    if clean_bullets:
        lines.extend(["### Supporting points", ""])
        lines.extend(f"- {_md_inline(bullet)}" for bullet in clean_bullets)
        lines.append("")

    conflicts = item.get("conflicts")
    conflicts = conflicts if isinstance(conflicts, list) else []
    clean_conflicts = [conflict for conflict in conflicts if isinstance(conflict, dict)]
    if clean_conflicts:
        lines.extend(["### Conflicts", ""])
        for conflict in clean_conflicts:
            task_a = _md_inline(conflict.get("task_a") or "?")
            task_b = _md_inline(conflict.get("task_b") or "?")
            text = _md_inline(conflict.get("conflict") or "")
            lines.append(f"- **Task {task_a} vs Task {task_b}:** {text}")
        lines.append("")


def generate_orchestration_markdown(
    item: dict[str, Any], generated_at: str = ""
) -> str:
    """Render one orchestration as a portable, safely escaped report."""
    orchestration_id = str(item.get("id") or "Unknown orchestration")
    lines = [
        "# Arena orchestration report",
        "",
        "> Unified multi-task research result exported from Arena.",
        "",
    ]
    if generated_at:
        lines.extend([f"_Exported {_md_inline(generated_at)} UTC_", ""])
    _append_orchestration_markdown(
        lines,
        item,
        f"## Orchestration {_md_inline(orchestration_id)}",
    )
    return "\n".join(lines)


def generate_orchestration_history_markdown(
    items: list[dict[str, Any]], generated_at: str = ""
) -> str:
    """Render a portable Markdown export of orchestration history.

    The history export intentionally stays at orchestration level rather than
    expanding every child task. This keeps the download compact while
    retaining the unified synthesis, its supporting bullets, and recorded
    conflicts that are otherwise only available in the JSON export.
    """
    lines = [
        "# Arena orchestration history",
        "",
        "> Multi-task research runs exported from Arena.",
        "",
    ]
    if generated_at:
        lines.extend([f"_Exported {_md_inline(generated_at)} UTC_", ""])

    if not items:
        lines.extend(["_No orchestrations found._", ""])
        return "\n".join(lines)

    lines.extend([f"{len(items)} orchestration(s)", ""])
    for index, item in enumerate(items, 1):
        orchestration_id = str(item.get("id") or "Unknown orchestration")
        _append_orchestration_markdown(
            lines,
            item,
            f"## {index}. {_md_inline(orchestration_id)}",
        )
        if index < len(items):
            lines.extend(["---", ""])

    return "\n".join(lines)


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
