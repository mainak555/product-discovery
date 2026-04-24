"""
Shared logging utilities: request-id contextvar + JSON formatter + logging filter.

Usage:
- `bind_request_id(value)` and `clear_request_id()` are called by `RequestIdMiddleware`.
- `RequestIdFilter` injects the current request id onto every LogRecord.
- `JsonFormatter` is the single formatter used by the console handler in
  `config/settings.py` LOGGING.
"""

import logging
from contextvars import ContextVar

from pythonjsonlogger import jsonlogger


_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def bind_request_id(value: str) -> object:
    """Bind the current request id; returns a token that can be used to reset."""
    return _request_id.set(value or "-")


def clear_request_id(token: object = None) -> None:
    """Reset the request id to the default sentinel."""
    if token is not None:
        try:
            _request_id.reset(token)  # type: ignore[arg-type]
            return
        except (ValueError, LookupError):
            pass
    _request_id.set("-")


def get_request_id() -> str:
    """Return the current request id (or '-' when no request is active)."""
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Attach the active request id to every log record as `record.request_id`."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


class JsonFormatter(jsonlogger.JsonFormatter):
    """JSON formatter that always includes timestamp, level, logger name, request_id, and trace ids."""

    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        log_record["timestamp"] = self.formatTime(record, self.datefmt)
        log_record["level"] = record.levelname
        log_record["logger"] = record.name
        log_record["request_id"] = getattr(record, "request_id", "-")
        log_record["trace_id"] = getattr(record, "trace_id", "-")
        log_record["span_id"] = getattr(record, "span_id", "-")


class TraceContextFilter(logging.Filter):
    """Attach the active OpenTelemetry trace_id / span_id to every log record.

    Allows console JSON lines to be cross-referenced with the OTLP backend
    (Langfuse / Tempo / Jaeger) by trace id. Safe no-op when OpenTelemetry
    is not importable or no span is active.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            from opentelemetry import trace
        except Exception:
            record.trace_id = "-"
            record.span_id = "-"
            return True
        try:
            span = trace.get_current_span()
            ctx = span.get_span_context() if span is not None else None
            if ctx is not None and getattr(ctx, "is_valid", False):
                record.trace_id = f"{ctx.trace_id:032x}"
                record.span_id = f"{ctx.span_id:016x}"
            else:
                record.trace_id = "-"
                record.span_id = "-"
        except Exception:
            record.trace_id = "-"
            record.span_id = "-"
        return True


# Suffixes whose INFO records are dropped from console output. Per-call HTTP
# detail (`*.api.call`) is captured on spans via OpenTelemetry; it would just
# be noise in console. WARNING/ERROR/EXCEPTION records always pass through.
_CONSOLE_INFO_SUPPRESS_SUFFIXES = (
    ".api.call",
)


class EventOnlyConsoleFilter(logging.Filter):
    """Drop noisy per-call INFO records from the console handler.

    Keeps lifecycle events (e.g. ``project.created``, ``tracing.enabled``)
    and all WARNING+ records. Suppresses high-frequency I/O detail that is
    already captured on spans.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno >= logging.WARNING:
            return True
        try:
            message = record.getMessage()
        except Exception:
            return True
        for suffix in _CONSOLE_INFO_SUPPRESS_SUFFIXES:
            if message.endswith(suffix):
                return False
        return True
