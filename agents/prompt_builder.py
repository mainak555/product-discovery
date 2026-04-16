"""Helpers for preparing AutoGen system prompts."""

from __future__ import annotations

from server.model_catalog import get_default_system_prompt


def resolve_system_prompt(system_prompt: str | None) -> str:
    """Return the saved system prompt or the default template."""
    cleaned = (system_prompt or "").strip()
    return cleaned or get_default_system_prompt()
