"""Factory for creating AutoGen model clients from model names."""

from __future__ import annotations

from importlib import import_module
from typing import Any

from .config_loader import get_model_metadata

_PROVIDER_CLIENTS = {
    "openai": ("autogen_ext.models.openai", "OpenAIChatCompletionClient"),
    "anthropic": ("autogen_ext.models.anthropic", "AnthropicChatCompletionClient"),
    "google": ("autogen_ext.models.google", "GeminiChatCompletionClient"),
}


def _load_client_class(provider: str):
    try:
        module_name, class_name = _PROVIDER_CLIENTS[provider]
    except KeyError as exc:
        raise ValueError(f"Unsupported model provider '{provider}'.") from exc

    try:
        module = import_module(module_name)
        return getattr(module, class_name)
    except (ImportError, AttributeError) as exc:
        raise RuntimeError(
            f"The AutoGen client for provider '{provider}' is not available. "
            f"Expected {module_name}.{class_name}."
        ) from exc


def build_model_client(model_name: str, **kwargs: Any):
    """Build a provider-specific AutoGen client from a selected model name."""
    metadata = get_model_metadata(model_name)
    provider = metadata.get("provider")
    if not provider:
        raise ValueError(f"Model '{model_name}' is missing provider metadata.")

    client_class = _load_client_class(str(provider))
    return client_class(model=model_name, **kwargs)
