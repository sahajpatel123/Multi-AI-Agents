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


def _markdown_answer_html(plain: str) -> str:
    raw = (plain or "").strip()
    if not raw:
        return ""
    try:
        body = markdown_lib.markdown(raw, extensions=["tables", "fenced_code"])
    except Exception:
        return f"<p>{html.escape(raw)}</p>"
    return f'<div class="answer-md">{body}</div>'


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
