"""Runtime helpers for loading shared agent model configuration."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
AGENT_MODELS_PATH = BASE_DIR / "agent_models.json"


@lru_cache(maxsize=1)
def load_agent_models() -> dict[str, dict]:
    """Load agent_models.json keyed by model name."""
    with AGENT_MODELS_PATH.open(encoding="utf-8") as catalog_file:
        data = json.load(catalog_file)
    if not isinstance(data, dict):
        raise ValueError("agent_models.json must contain a JSON object keyed by model name.")
    return {
        str(model_name).strip(): metadata if isinstance(metadata, dict) else {}
        for model_name, metadata in data.items()
        if str(model_name).strip()
    }


def get_model_metadata(model_name: str) -> dict:
    """Return metadata for a selected model name."""
    try:
        return load_agent_models()[model_name]
    except KeyError as exc:
        raise ValueError(f"Unsupported model '{model_name}'.") from exc
