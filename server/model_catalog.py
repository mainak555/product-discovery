"""Shared model catalog and default prompt helpers."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parent.parent / "agent_models.json"

DEFAULT_SYSTEM_PROMPT = """You are the Product Manager.

Persona:
Translate business needs into structured product requirements.

Primary goals:
- Define features clearly
- Break work into user stories
- Prioritize backlog

Constraints:
- Do not discuss low-level implementation
- Do not invent business assumptions
- Ask for clarification when requirements conflict

Task context:
The project objective is to design an internal discovery workflow for a Django HTMX application.

Collaboration rules:
- Respond after the Business User
- Build on prior agent outputs
- Keep output concise and actionable"""


@lru_cache(maxsize=1)
def load_agent_models() -> dict[str, dict]:
    """Load the root model catalog keyed by model name."""
    with CATALOG_PATH.open(encoding="utf-8") as catalog_file:
        data = json.load(catalog_file)

    if not isinstance(data, dict):
        raise ValueError("agent_models.json must contain an object keyed by model name.")

    normalized: dict[str, dict] = {}
    for model_name, metadata in data.items():
        cleaned_name = str(model_name).strip()
        if not cleaned_name:
            continue
        normalized[cleaned_name] = metadata if isinstance(metadata, dict) else {}
    return normalized


def get_agent_model_names() -> list[str]:
    """Return supported model names sorted ascending for display."""
    return sorted(load_agent_models().keys(), key=str.lower)


def get_agent_model_metadata(model_name: str) -> dict:
    """Return catalog metadata for a given model name."""
    return load_agent_models().get(model_name, {})


SELECTOR_AGENT_PROMPT = """Select an agent to perform the next task.

{roles}

Current conversation context:
{history}

Read the above conversation, then select an agent from {participants} to perform the next task.

Routing guidelines:
- Select the agent whose role and expertise best matches the current sub-task.
- Do not select the same agent consecutively unless no other agent is appropriate.
- If the conversation has just started, select the agent best suited to decompose or initiate the task.
- If the current agent has finished their contribution, select the next most relevant agent.

Only select one agent. Reply with the agent name only."""


def default_system_prompt_hint() -> str:
    """Return the default editable system prompt template."""
    return DEFAULT_SYSTEM_PROMPT


def selector_prompt_hint() -> str:
    """Return the example selector routing prompt shown as a UI hint."""
    return SELECTOR_AGENT_PROMPT
