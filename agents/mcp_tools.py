"""
MCP (Model Context Protocol) tool wiring for assistant agents.

Resolves the per-agent MCP scope (`none` / `shared` / `dedicated`) into one or
more `McpWorkbench` instances and exposes lifecycle hooks that the team
runtime cache uses to dispose of spawned subprocesses on team eviction.

Transport support:
  - stdio (default; entry shape: {command, args, env})
  - streamable HTTP (entry shape: {transport: "http", url, headers})

SSE is intentionally NOT supported (deprecated upstream).

Logging contract (see .agents/skills/observability_logging/SKILL.md):
  - `agents.mcp.created`  — INFO; payload contains scope + server names only.
  - `agents.mcp.closed`   — INFO; payload contains scope + server names only.
  - `agents.mcp.failed`   — EXCEPTION; never logs `args`/`env`/`headers`.
  - `args`, `env`, and `headers` MUST be redacted/omitted from every log line.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import TYPE_CHECKING, Any

from core.tracing import traced_function

if TYPE_CHECKING:
    from autogen_ext.tools.mcp import McpWorkbench

logger = logging.getLogger(__name__)


# session_id → list[McpWorkbench] — owned by the team runtime cache so that
# `evict_team()` can dispose them on team teardown.
_SESSION_WORKBENCHES: dict[str, list[Any]] = {}


def _server_fingerprint(servers: dict) -> str:
    """Stable hash of a normalized mcpServers dict (used for de-dup/caching)."""
    blob = json.dumps(servers, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:12]


def _build_server_params(name: str, entry: dict):
    """Map a validated mcpServers[name] entry to autogen_ext server params."""
    from autogen_ext.tools.mcp import StdioServerParams, StreamableHttpServerParams

    transport = (entry.get("transport") or "").strip().lower()
    if transport == "http" or "url" in entry:
        return StreamableHttpServerParams(
            url=entry["url"],
            headers=entry.get("headers") or None,
        )
    return StdioServerParams(
        command=entry["command"],
        args=list(entry.get("args") or []),
        env=dict(entry.get("env") or {}),
    )


def resolve_mcp_servers_for_agent(agent_cfg: dict, project: dict) -> dict:
    """
    Return the merged mcpServers dict that applies to a given agent based
    on its scope. Empty dict when no MCP tools should be attached.
    """
    scope = (agent_cfg.get("mcp_tools") or "none").strip().lower()
    if scope == "dedicated":
        cfg = agent_cfg.get("mcp_configuration") or {}
        return cfg.get("mcpServers") or {}
    if scope == "shared":
        cfg = project.get("shared_mcp_tools") or {}
        return cfg.get("mcpServers") or {}
    return {}


@traced_function("agents.mcp.workbench_built")
def build_mcp_workbenches(servers: dict, scope: str) -> list[Any]:
    """
    Construct one `McpWorkbench` per server entry. The workbenches are NOT
    started here — autogen lazily starts each workbench on first tool call,
    or `register_session_workbenches()` can attach them to a session for
    deterministic teardown via `close_session_workbenches()`.

    Returns an empty list if `servers` is empty.
    """
    if not servers:
        return []

    from autogen_ext.tools.mcp import McpWorkbench

    workbenches: list[Any] = []
    server_names: list[str] = []
    for name, entry in servers.items():
        params = _build_server_params(name, entry)
        workbenches.append(McpWorkbench(server_params=params))
        server_names.append(name)

    logger.info(
        "agents.mcp.created",
        extra={
            "scope": scope,
            "server_count": len(workbenches),
            "server_names": server_names,
            "fingerprint": _server_fingerprint(servers),
        },
    )
    return workbenches


def register_session_workbenches(session_id: str, workbenches: list[Any]) -> None:
    """Track workbenches that should be torn down when the session is evicted."""
    if not workbenches:
        return
    _SESSION_WORKBENCHES.setdefault(session_id, []).extend(workbenches)


def close_session_workbenches(session_id: str) -> None:
    """Stop and discard all MCP workbenches associated with a session."""
    workbenches = _SESSION_WORKBENCHES.pop(session_id, [])
    if not workbenches:
        return

    async def _stop_all():
        for wb in workbenches:
            try:
                await wb.stop()
            except Exception:  # noqa: BLE001
                logger.exception(
                    "agents.mcp.failed",
                    extra={"session_id": session_id, "phase": "stop"},
                )

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Schedule and forget — eviction is fire-and-forget by design.
            loop.create_task(_stop_all())
        else:
            loop.run_until_complete(_stop_all())
    except RuntimeError:
        asyncio.run(_stop_all())

    logger.info(
        "agents.mcp.closed",
        extra={"session_id": session_id, "workbench_count": len(workbenches)},
    )
