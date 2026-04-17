"""Factory for creating AutoGen model clients from model names.

Provider registry
-----------------
Each provider maps to a dedicated builder function that knows the correct
AutoGen client class and constructor signature for that backend:

  openai           — direct OpenAI API        (OpenAIChatCompletionClient)
  anthropic        — direct Anthropic API      (AnthropicChatCompletionClient)
  google           — direct Google Gemini API  (GeminiChatCompletionClient)
  azure_openai     — Azure AI Foundry OpenAI   (AzureOpenAIChatCompletionClient)
  azure_anthropic  — Azure AI Foundry Anthropic (AnthropicChatCompletionClient + base_url)

To add a new provider, define a _build_<name> function and add one line to
_PROVIDER_BUILDERS at the bottom.
"""

from __future__ import annotations

import os
from importlib import import_module
from typing import Any

from .config_loader import get_model_metadata


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _import_class(module_name: str, class_name: str):
    """Dynamically import a class; raise RuntimeError if the package is missing."""
    try:
        module = import_module(module_name)
        return getattr(module, class_name)
    except (ImportError, AttributeError) as exc:
        raise RuntimeError(
            f"AutoGen client '{class_name}' from '{module_name}' is not available. "
            "Ensure the required autogen-ext provider extra is installed."
        ) from exc


def _require_env(env_name: str) -> str:
    """Return env var value or raise ValueError naming the missing variable."""
    value = os.getenv(env_name, "").strip()
    if not value:
        raise ValueError(f"Required environment variable '{env_name}' is not set.")
    return value


def _require_meta(model_name: str, metadata: dict, field: str) -> str:
    """Return a required field from model metadata or raise ValueError."""
    value = str(metadata.get(field) or "").strip()
    if not value:
        raise ValueError(
            f"Model '{model_name}' is missing required field '{field}' in agent_models.json."
        )
    return value


# ---------------------------------------------------------------------------
# Per-provider builder functions
# ---------------------------------------------------------------------------

def _build_openai(model_name: str, metadata: dict, **kwargs: Any):
    """Direct OpenAI API via OpenAIChatCompletionClient.

    Env var: OPENAI_API_KEY
    """
    cls = _import_class("autogen_ext.models.openai", "OpenAIChatCompletionClient")
    kwargs.setdefault("api_key", _require_env("OPENAI_API_KEY"))
    return cls(model=model_name, **kwargs)


def _build_anthropic(model_name: str, metadata: dict, **kwargs: Any):
    """Direct Anthropic API via AnthropicChatCompletionClient.

    Env var: ANTHROPIC_API_KEY
    """
    cls = _import_class("autogen_ext.models.anthropic", "AnthropicChatCompletionClient")
    kwargs.setdefault("api_key", _require_env("ANTHROPIC_API_KEY"))
    return cls(model=model_name, **kwargs)


def _build_google(model_name: str, metadata: dict, **kwargs: Any):
    """Direct Google Gemini API via GeminiChatCompletionClient.

    Env var: GOOGLE_API_KEY
    """
    cls = _import_class("autogen_ext.models.google", "GeminiChatCompletionClient")
    kwargs.setdefault("api_key", _require_env("GOOGLE_API_KEY"))
    return cls(model=model_name, **kwargs)


def _build_azure_openai(model_name: str, metadata: dict, **kwargs: Any):
    """Azure AI Foundry OpenAI deployment via AzureOpenAIChatCompletionClient.

    agent_models.json fields:
      endpoint    (required) — Azure resource endpoint URL
                               e.g. https://<resource>.cognitiveservices.azure.com/
      api_version (optional) — defaults to 2024-12-01-preview
      deployment  (optional) — deployment name override; defaults to the model key
    Env var: AZURE_OPENAI_API_KEY
    """
    cls = _import_class("autogen_ext.models.openai", "AzureOpenAIChatCompletionClient")
    endpoint = _require_meta(model_name, metadata, "endpoint")
    api_version = str(metadata.get("api_version") or "2024-12-01-preview").strip()
    deployment = str(metadata.get("deployment") or model_name).strip()
    kwargs.setdefault("api_key", _require_env("AZURE_OPENAI_API_KEY"))
    kwargs.setdefault("azure_endpoint", endpoint)
    kwargs.setdefault("azure_deployment", deployment)
    kwargs.setdefault("api_version", api_version)
    return cls(model=deployment, **kwargs)


def _build_azure_anthropic(model_name: str, metadata: dict, **kwargs: Any):
    """Anthropic model on Azure AI Foundry via AnthropicChatCompletionClient.

    Passes base_url so the underlying Anthropic SDK routes requests to the
    Azure AI Services endpoint instead of api.anthropic.com.

    agent_models.json fields:
      endpoint   (required) — Azure AI Services Anthropic endpoint URL
                              e.g. https://<resource>.services.ai.azure.com/anthropic/
      deployment (optional) — deployment name override; defaults to the model key
    Env var: AZURE_ANTHROPIC_API_KEY
    """
    cls = _import_class("autogen_ext.models.anthropic", "AnthropicChatCompletionClient")
    endpoint = _require_meta(model_name, metadata, "endpoint")
    deployment = str(metadata.get("deployment") or model_name).strip()
    kwargs.setdefault("api_key", _require_env("AZURE_ANTHROPIC_API_KEY"))
    kwargs.setdefault("base_url", endpoint)
    return cls(model=deployment, **kwargs)


# ---------------------------------------------------------------------------
# Provider registry — add new providers here
# ---------------------------------------------------------------------------

_PROVIDER_BUILDERS: dict[str, Any] = {
    "openai": _build_openai,
    "anthropic": _build_anthropic,
    "google": _build_google,
    "azure_openai": _build_azure_openai,
    "azure_anthropic": _build_azure_anthropic,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_model_client(model_name: str, **kwargs: Any):
    """Build a provider-specific AutoGen model client from a catalog model name.

    Resolves the model's provider from agent_models.json, injects credentials
    from environment variables, and constructs the appropriate AutoGen client.
    """
    metadata = get_model_metadata(model_name)
    provider = str(metadata.get("provider") or "").strip().lower()
    if not provider:
        raise ValueError(f"Model '{model_name}' is missing 'provider' in agent_models.json.")

    builder = _PROVIDER_BUILDERS.get(provider)
    if builder is None:
        supported = ", ".join(_PROVIDER_BUILDERS)
        raise ValueError(
            f"Unsupported provider '{provider}' for model '{model_name}'. "
            f"Supported providers: {supported}."
        )

    return builder(model_name, metadata, **kwargs)
