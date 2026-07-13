"""Runtime MCP search for Agent researcher stage (decrypt token + vendor APIs)."""

from __future__ import annotations

import logging
from typing import Any
import httpx

from arena.core.token_crypto import try_decrypt_token

logger = logging.getLogger(__name__)

NOTION_VERSION = "2022-06-28"


def _unified_item(title: str, excerpt: str, source: str, url: str) -> dict[str, str]:
    return {
        "title": title[:500],
        "excerpt": excerpt[:1500],
        "source": source[:120],
        "url": url[:2000],
    }


async def search_notion(token: str, query: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    q = (query or "").strip()[:500]
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.notion.com/v1/search",
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": NOTION_VERSION,
                "Content-Type": "application/json",
            },
            json={"query": q, "page_size": 5},
        )
        if r.status_code >= 400:
            logger.warning("[MCP] Notion search HTTP %s: %s", r.status_code, r.text[:200])
            return out
        data = r.json()
        for item in data.get("results") or []:
            obj = item.get("object") or ""
            title = ""
            if obj == "page":
                props = item.get("properties") or {}
                for _k, pv in props.items():
                    if isinstance(pv, dict) and pv.get("type") == "title":
                        ta = pv.get("title") or []
                        if ta and isinstance(ta[0], dict):
                            title = (ta[0].get("plain_text") or "").strip()
                        break
            if not title:
                title = item.get("id", "Untitled")[:80]
            excerpt = (item.get("url") or "")[:200]
            url = item.get("url") or ""
            out.append(_unified_item(title, excerpt, "Notion", url))
    return out


async def search_github_code(token: str, query: str, github_login: str | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    q = (query or "").strip()[:256]
    user_q = f"{q} user:{github_login}" if github_login else q
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            "https://api.github.com/search/code",
            params={"q": user_q, "per_page": 5},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "Arena-Agent/1.0",
            },
        )
        if r.status_code >= 400:
            logger.warning("[MCP] GitHub search HTTP %s: %s", r.status_code, r.text[:200])
            return out
        data = r.json()
        for item in data.get("items") or []:
            name = item.get("name") or "file"
            path = item.get("path") or ""
            html_url = item.get("html_url") or ""
            repo = (item.get("repository") or {}).get("full_name") or ""
            title = f"{repo}/{path}" if repo else path or name
            excerpt = name
            out.append(_unified_item(title, excerpt, "GitHub", html_url))
    return out


async def search_google_drive(token: str, query: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    q = (query or "").strip()[:200]
    escaped = q.replace("\\", "\\\\").replace("'", "\\'")
    fq = f"fullText contains '{escaped}'"
    url = "https://www.googleapis.com/drive/v3/files"
    params = {
        "q": fq,
        "pageSize": 5,
        "fields": "files(id,name,webViewLink,mimeType)",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code >= 400:
            logger.warning("[MCP] Drive search HTTP %s: %s", r.status_code, r.text[:200])
            return out
        data = r.json()
        for f in data.get("files") or []:
            name = f.get("name") or "file"
            link = f.get("webViewLink") or f"https://drive.google.com/file/d/{f.get('id', '')}/view"
            mime = f.get("mimeType") or ""
            out.append(_unified_item(name, mime, "Google Drive", link))
    return out


async def fetch_mcp_context_for_task(
    db,
    user_id: int,
    integration_ids: list[int],
    task_text: str,
) -> str:
    """Build PERSONAL KNOWLEDGE BASE CONTEXT block for the researcher."""
    from arena.db_models import MCPIntegration

    if not integration_ids:
        return ""
    query = (task_text or "").strip()[:500]
    if not query:
        return ""

    lines: list[str] = []
    for iid in integration_ids[:8]:
        row = (
            db.query(MCPIntegration)
            .filter(
                MCPIntegration.id == iid,
                MCPIntegration.user_id == user_id,
                MCPIntegration.is_active.is_(True),
            )
            .first()
        )
        if not row or not getattr(row, "is_active", True):
            continue
        raw = row.access_token
        if not raw:
            continue
        token = try_decrypt_token(raw)
        if not token:
            logger.warning("[MCP] Could not decrypt token for integration id=%s", iid)
            continue
        service = (row.service or "").strip()
        meta: Any = row.integration_metadata
        if isinstance(meta, str):
            try:
                import json

                meta = json.loads(meta)
            except Exception:
                meta = {}
        if not isinstance(meta, dict):
            meta = {}

        results: list[dict[str, str]] = []
        try:
            if service == "notion":
                results = await search_notion(token, query)
            elif service == "github":
                login = meta.get("github_login") or meta.get("username")
                results = await search_github_code(token, query, login)
            elif service == "google_drive":
                results = await search_google_drive(token, query)
        except Exception as e:
            logger.warning("[MCP] Search failed service=%s: %s", service, e)
            continue

        if not results:
            continue
        svc_name = row.display_name or service
        lines.append(f"### {svc_name} ({service})")
        for r in results:
            lines.append(
                f"- **{r['title']}** ({r['source']}): {r['excerpt'][:400]}\n  URL: {r['url']}"
            )

    if not lines:
        return ""

    formatted = "\n".join(lines)
    return f"""
PERSONAL KNOWLEDGE BASE CONTEXT:
The user has connected external tools. The following relevant content was found in their workspace:

{formatted}

Consider this alongside web research. Flag if personal docs contradict or support findings.
""".strip()


async def search_integration_api(
    row: Any,
    query: str,
) -> list[dict[str, str]]:
    """HTTP API for GET /api/mcp/integrations/{id}/search (manual QA)."""
    raw = row.access_token
    if not raw:
        return []
    token = try_decrypt_token(raw)
    if not token:
        return []
    service = (row.service or "").strip()
    meta: Any = getattr(row, "integration_metadata", None)
    if isinstance(meta, str):
        try:
            import json

            meta = json.loads(meta)
        except Exception:
            meta = {}
    if not isinstance(meta, dict):
        meta = {}
    q = (query or "").strip()[:500]
    if service == "notion":
        return await search_notion(token, q)
    if service == "github":
        login = meta.get("github_login") or meta.get("username")
        return await search_github_code(token, q, login)
    if service == "google_drive":
        return await search_google_drive(token, q)
    return []
