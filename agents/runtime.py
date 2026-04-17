"""
In-memory AutoGen team runtime cache.

Teams are keyed by session_id and kept alive between SSE calls so AutoGen's
built-in conversation history is preserved for multi-round human-gated runs.

Cache is process-local. On server restart a session in "awaiting_input" will
rebuild the team; the full prior discussion from MongoDB is passed as the
initial task so agents retain context.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from autogen_agentchat.teams import RoundRobinGroupChat
    from autogen_core import CancellationToken

# session_id → RoundRobinGroupChat
_TEAM_CACHE: dict[str, "RoundRobinGroupChat"] = {}

# session_id → CancellationToken
_CANCEL_TOKENS: dict[str, "CancellationToken"] = {}


def get_or_build_team(session_id: str, project: dict) -> tuple["RoundRobinGroupChat", "CancellationToken"]:
    """
    Return (team, cancellation_token) for session_id.

    Builds a fresh team on cache miss. Existing teams retain AutoGen's
    internal conversation history for stateful resumption.
    """
    from autogen_core import CancellationToken as CT
    from .team_builder import build_team

    if session_id not in _TEAM_CACHE:
        _TEAM_CACHE[session_id] = build_team(project)
        _CANCEL_TOKENS[session_id] = CT()

    return _TEAM_CACHE[session_id], _CANCEL_TOKENS[session_id]


def reset_cancel_token(session_id: str) -> "CancellationToken":
    """Replace the cancellation token (needed between rounds)."""
    from autogen_core import CancellationToken as CT

    token = CT()
    _CANCEL_TOKENS[session_id] = token
    return token


def cancel_team(session_id: str) -> None:
    """Signal the currently-running SSE stream to stop after this agent's turn."""
    token = _CANCEL_TOKENS.get(session_id)
    if token:
        token.cancel()


def evict_team(session_id: str) -> None:
    """Remove team from cache (call after stop or final completion)."""
    _TEAM_CACHE.pop(session_id, None)
    _CANCEL_TOKENS.pop(session_id, None)
