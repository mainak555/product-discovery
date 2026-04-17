"""Helpers for preparing AutoGen system prompts."""

from __future__ import annotations


def resolve_system_prompt(system_prompt: str, objective: str = "") -> str:
    """Return the agent system prompt with the project objective appended.

    The system_prompt is used as-is (schemas enforce it is non-empty).
    If objective is provided it is appended after the persona content so
    the role line (line 1) always remains the agent's identity anchor.
    """
    cleaned = (system_prompt or "").strip()
    if objective:
        cleaned = f"{cleaned}\n\n---\nProject Objective:\n{objective}"
    return cleaned
