"""Runtime MCP search for Agent researcher stage (decrypt token + vendor APIs)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse
import httpx

from arena.core.token_crypto import try_decrypt_token

logger = logging.getLogger(__name__)

NOTION_VERSION = "2022-06-28"

# ── Outbound URL allowlist (defense-in-depth vs SSRF) ─────────────────────
# Today every search_*() function below hardcodes its target URL, so the
# allowlist is redundant in the happy path. It exists so that:
#   1. A developer who pastes a wrong vendor URL fails CI / breaks at startup
#      instead of silently proxying tokens to an attacker-controlled host.
#   2. Any future "make the vendor URL configurable" refactor inherits a
#      host allowlist the new code path MUST consult, so the SSRF surface
#      cannot widen by accident.
#
# Subdomains are NOT trusted automatically — they must be listed explicitly.
# e.g. api.github.com is allowed, evil.github.com is not (different owner).
SERVICE_URL_ALLOWLIST: dict[str, frozenset[str]] = {
    "notion":      frozenset({"api.notion.com"}),
    "github":      frozenset({"api.github.com", "github.com"}),
    "google_drive": frozenset({"www.googleapis.com"}),
}


def _assert_safe_service_url(service: str, full_url: str) -> None:
    """Raise ValueError if `full_url`'s hostname is not on `service`'s allowlist.

    The error halts the request before any token leaves the process. We do
    NOT silently fall back to an alternative URL — that would mask the bug.
    """
    allowed_hosts = SERVICE_URL_ALLOWLIST.get(service)
    if allowed_hosts is None:
        raise ValueError(
            f"mcp_runtime: no URL allowlist configured for service={service!r}; "
            "refusing to send request (add the host to SERVICE_URL_ALLOWLIST "
            "if this service is real)."
        )
    parsed = urlparse(full_url)
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError(
            f"mcp_runtime: refusing to send request with no host component: {full_url!r}"
        )
    if (parsed.scheme or "").lower() != "https":
        # Only HTTPS leaves the process — no cleartext or exotic schemes.
        raise ValueError(
            f"mcp_runtime: refusing non-HTTPS URL for service={service!r}: {full_url!r}"
        )
    if host not in allowed_hosts:
        raise ValueError(
            f"mcp_runtime: outbound host {host!r} not in {service!r} allowlist "
            f"({sorted(allowed_hosts)}); refusing to send token to it"
        )


def _outbound_client() -> httpx.AsyncClient:
    """Shared client policy for all MCP vendor calls.

    - follow_redirects=False: an allowlisted host must not 30x us onto
      an internal network (SSRF via open redirect).
    - trust_env=False: ignore HTTP(S)_PROXY from the process environment
      so a compromised env cannot re-route bearer tokens through a proxy.
    """
    return httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=False,
        trust_env=False,
    )


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
    _assert_safe_service_url("notion", "https://api.notion.com/v1/search")
    async with _outbound_client() as client:
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
    _assert_safe_service_url("github", "https://api.github.com/search/code")
    async with _outbound_client() as client:
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
    _assert_safe_service_url("google_drive", url)
    params = {
        "q": fq,
        "pageSize": 5,
        "fields": "files(id,name,webViewLink,mimeType)",
    }
    async with _outbound_client() as client:
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
                logger.warning("Failed to parse integration_metadata JSON (line 228)", exc_info=True)
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
            logger.warning("Failed to parse integration_metadata JSON (line 287)", exc_info=True)
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
