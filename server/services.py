"""
Business logic layer — pure functions operating on dicts.

No request/response objects here. Views call these functions
and translate results into HTTP/HTMX responses.
"""

import hmac
import os

from pymongo.errors import DuplicateKeyError

from .db import get_collection, ensure_indexes
from .model_catalog import get_agent_model_names, get_default_system_prompt
from .schemas import validate_project


def _coerce_temperature(value):
    """Return a float temperature with a safe default for legacy documents."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.7


def get_available_models():
    """Return model names sorted ascending for UI rendering."""
    return get_agent_model_names()


def get_system_prompt_template():
    """Return the default editable system prompt template."""
    return get_default_system_prompt()


def normalize_project(project):
    """Normalize stored project documents for display across old and new schemas."""
    if not project:
        return None

    available_models = get_available_models()
    default_model = available_models[0] if available_models else ""
    default_prompt = get_system_prompt_template()

    raw_human_gate = project.get("human_gate") or None
    assistants = []
    for raw_agent in project.get("agents") or []:
        if raw_agent.get("type") == "human_proxy":
            if raw_human_gate is None:
                raw_human_gate = {
                    "enabled": True,
                    "name": raw_agent.get("name") or "Architect",
                    "interaction_mode": "feedback"
                    if (raw_agent.get("interaction_mode") or "").strip() == "feedback"
                    else "approve_reject",
                }
            continue

        llm_config = raw_agent.get("llm_config") or {}
        assistants.append({
            "name": (raw_agent.get("name") or "").strip(),
            "model": (raw_agent.get("model") or raw_agent.get("model_name") or default_model).strip(),
            "system_prompt": (
                raw_agent.get("system_prompt")
                or raw_agent.get("persona")
                or default_prompt
            ).strip(),
            "temperature": _coerce_temperature(
                raw_agent.get("temperature", llm_config.get("temperature", 0.7))
            ),
        })

    if not assistants:
        assistants = [{
            "name": "",
            "model": default_model,
            "system_prompt": default_prompt,
            "temperature": 0.7,
        }]

    human_gate = {
        "enabled": False,
        "name": "",
        "interaction_mode": "approve_reject",
    }
    if isinstance(raw_human_gate, dict):
        human_gate = {
            "enabled": bool(raw_human_gate.get("enabled", True)),
            "name": (raw_human_gate.get("name") or "").strip(),
            "interaction_mode": (
                raw_human_gate.get("interaction_mode") or "approve_reject"
            ).strip() or "approve_reject",
        }

    raw_team = project.get("team") or {}
    team = {
        "type": (raw_team.get("type") or "round_robin").strip() or "round_robin",
        "max_iterations": raw_team.get("max_iterations", project.get("max_iterations", 5)),
    }

    return {
        "project_name": project.get("project_name", ""),
        "objective": project.get("objective", ""),
        "agents": assistants,
        "human_gate": human_gate,
        "team": team,
    }


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

def list_projects():
    """Return all project settings, sorted by project_name ascending."""
    ensure_indexes()
    col = get_collection("project_settings")
    cursor = col.find({}, {"_id": 0}).sort("project_name", 1)
    return list(cursor)


def get_project(project_name):
    """Return a single project by name, or None if not found."""
    ensure_indexes()
    col = get_collection("project_settings")
    project = col.find_one({"project_name": project_name}, {"_id": 0})
    return normalize_project(project)


def create_project(data):
    """
    Validate and insert a new project configuration.

    Returns the created document (without _id).
    Raises ValueError on validation errors or duplicate name.
    """
    cleaned = validate_project(data)

    ensure_indexes()
    col = get_collection("project_settings")
    try:
        col.insert_one(cleaned.copy())
    except DuplicateKeyError:
        raise ValueError(
            f"Project '{cleaned['project_name']}' already exists."
        )

    return normalize_project(cleaned)


def update_project(project_name, data):
    """
    Validate and update an existing project configuration.

    The project_name in the URL is authoritative (cannot be changed).
    Returns the updated document.
    Raises ValueError on validation errors or if the project doesn't exist.
    """
    # Force the project_name from the URL (prevent renaming)
    data["project_name"] = project_name
    cleaned = validate_project(data)

    ensure_indexes()
    col = get_collection("project_settings")
    result = col.replace_one(
        {"project_name": project_name},
        cleaned,
    )
    if result.matched_count == 0:
        raise ValueError(f"Project '{project_name}' not found.")

    return normalize_project(cleaned)


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def verify_secret_key(key):
    """
    Constant-time comparison of the provided key against APP_SECRET_KEY.

    Returns True if the key matches, False otherwise.
    """
    expected = os.getenv("APP_SECRET_KEY", "")
    if not expected:
        return False
    return hmac.compare_digest(key, expected)
