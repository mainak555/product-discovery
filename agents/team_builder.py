"""Helpers for building AutoGen teams from saved configuration."""

from __future__ import annotations

from .factory import build_model_client
from .prompt_builder import resolve_system_prompt


def build_agent_runtime_spec(agent_config: dict) -> dict:
    """Return a lightweight runtime spec for a configured assistant agent."""
    return {
        "name": agent_config["name"],
        "model_client": build_model_client(
            agent_config["model"],
            temperature=agent_config.get("temperature", 0.7),
        ),
        "system_message": resolve_system_prompt(agent_config.get("system_prompt")),
    }
