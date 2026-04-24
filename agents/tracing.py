"""
Langfuse tracing wiring via OpenTelemetry.

Env-gated: requires LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY. Optional
LANGFUSE_HOST (default https://cloud.langfuse.com).

When env vars are missing, init_tracing() logs `tracing.disabled` and returns
without configuring an exporter. Failures during init are logged via
`logger.exception` and never propagate.

Once initialized, the global OpenTelemetry TracerProvider is set; AutoGen 0.4+
SingleThreadedAgentRuntime picks up the tracer provider passed explicitly or
falls back to the global one used by manual spans.
"""

import base64
from contextlib import contextmanager
import logging
import os
from threading import Lock
from typing import Any, Iterator

logger = logging.getLogger(__name__)

_initialized = False
_lock = Lock()
_tracer_provider = None


def _is_agent_llm_span(span: Any) -> bool:
    """Return True when a span belongs to Agent/LLM execution scope."""
    name = str(getattr(span, "name", "")).lower()
    attributes = getattr(span, "attributes", {}) or {}
    scope = getattr(span, "instrumentation_scope", None)
    scope_name = str(getattr(scope, "name", "")).lower() if scope is not None else ""

    # AutoGen-instrumented spans are always in scope for Langfuse.
    if scope_name.startswith("autogen"):
        return True

    # Manual allowlist for agent-owned LLM spans.
    if name == "agents.extraction.run":
        return True

    gen_ai_system = str(attributes.get("gen_ai.system", "")).lower()
    app_component = str(attributes.get("app.component", "")).lower()
    if name.startswith("agents.llm.") and gen_ai_system:
        return True
    if name.startswith("agents.") and app_component.startswith("agents.") and gen_ai_system:
        return True

    return False


class AgentLlmFilteringExporter:
    """Forward only Agent/LLM spans to the wrapped exporter."""

    def __init__(self, delegate: Any, span_export_result_success: Any):
        self._delegate = delegate
        self._success = span_export_result_success

    def export(self, spans: Any) -> Any:
        allowed = [span for span in spans if _is_agent_llm_span(span)]
        if not allowed:
            return self._success
        return self._delegate.export(tuple(allowed))

    def shutdown(self) -> None:
        self._delegate.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        force_flush = getattr(self._delegate, "force_flush", None)
        if callable(force_flush):
            try:
                return bool(force_flush(timeout_millis=timeout_millis))
            except TypeError:
                return bool(force_flush())
        return True


def get_tracer_provider():
    """Return the configured TracerProvider, or None when tracing is disabled."""
    return _tracer_provider


def is_tracing_enabled() -> bool:
    """Return True when an OTLP exporter has been configured successfully."""
    return _tracer_provider is not None


@contextmanager
def traced_block(span_name: str, attributes: dict[str, Any] | None = None) -> Iterator[Any]:
    """Create a best-effort OpenTelemetry span for manual trace coverage.

    This helper never raises if OpenTelemetry is unavailable; callers can use it
    safely around critical paths like standalone extractor calls.
    """
    try:
        from opentelemetry import trace
        from opentelemetry.trace import Status, StatusCode
    except Exception:
        yield None
        return

    tracer = trace.get_tracer("product-discovery")
    with tracer.start_as_current_span(span_name) as span:
        if attributes:
            for key, value in attributes.items():
                if value is None:
                    continue
                span.set_attribute(key, value)
        try:
            yield span
        except Exception as exc:
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR, str(exc)))
            raise


def init_tracing() -> bool:
    """Initialize Langfuse OTLP exporter once per process. Returns True on success."""
    global _initialized, _tracer_provider

    with _lock:
        if _initialized:
            return _tracer_provider is not None

        public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
        secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
        host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com").strip().rstrip("/")

        if not public_key or not secret_key:
            logger.info("tracing.disabled", extra={"reason": "missing_langfuse_credentials"})
            _initialized = True
            return False

        try:
            from opentelemetry import trace
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExportResult
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )
        except Exception:
            logger.exception("tracing.import_failed")
            _initialized = True
            return False

        try:
            auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
            exporter = OTLPSpanExporter(
                endpoint=f"{host}/api/public/otel/v1/traces",
                headers={"Authorization": f"Basic {auth}"},
            )
            filtered_exporter: Any = AgentLlmFilteringExporter(exporter, SpanExportResult.SUCCESS)
            resource = Resource.create({
                "service.name": os.getenv("OTEL_SERVICE_NAME", "product-discovery"),
            })
            provider = TracerProvider(resource=resource)
            provider.add_span_processor(BatchSpanProcessor(filtered_exporter))
            trace.set_tracer_provider(provider)
            _tracer_provider = provider
            logger.info(
                "tracing.enabled",
                extra={"host": host, "service_name": resource.attributes.get("service.name")},
            )
        except Exception:
            logger.exception("tracing.setup_failed")
            _initialized = True
            return False

        _initialized = True
        return True
