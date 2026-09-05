"""Spans for the work the worker does, sent wherever the environment points.

Under ``aspire run`` that is the Aspire Dashboard, and a Job's span hangs off
the request that enqueued it, so one view carries a click through the API route
to this process shelling out to ffmpeg. Everywhere else — ``uv run
akapela-worker``, the compose image — nothing is configured, nothing is
imported, nothing is sent, and no collector is needed. The OpenTelemetry
packages are a dev dependency the image installs with ``--no-dev``, which is why
they are imported inside :func:`configure` rather than at the top of the file:
importing this module must work in an installation that does not have them.

Everything on the hot path stays where it was. A span is opened when a Job is
claimed and closed when it ends; nothing wraps ffmpeg's output, reads audio, or
runs per frame.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:  # pragma: no cover - types only
    from .runner import Job

log = logging.getLogger(__name__)


class JobSpan(Protocol):
    """The open span, for the one thing the runner has to say about it."""

    def failed(self, exc: BaseException) -> None:
        """Records what went wrong. The runner catches the exception itself, so
        without this the span would close green on a Job that failed."""
        ...


class Telemetry(Protocol):
    """What the runner uses. Both implementations answer every call."""

    enabled: bool

    def job_span(self, job: Job, trace_parent: str | None) -> Any:
        """A context manager covering one Job from claim to terminal state."""
        ...

    def shutdown(self) -> None:
        """Flushes and closes. Safe on a disabled telemetry, and safe twice."""
        ...


class _NoJobSpan:
    def failed(self, exc: BaseException) -> None:
        pass


@dataclass
class _NoTelemetry:
    enabled: bool = False

    @contextmanager
    def job_span(self, job: Job, trace_parent: str | None) -> Iterator[JobSpan]:
        yield _NoJobSpan()

    def shutdown(self) -> None:
        pass


def configure(env: Mapping[str, str] | None = None, processor: Any = None) -> Telemetry:
    """Telemetry for this process, or the do-nothing one when nothing collects.

    ``processor`` replaces the batching OTLP exporter; tests pass one that
    collects in memory.
    """
    environment = os.environ if env is None else env
    endpoint = environment.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return _NoTelemetry()

    try:
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.trace import SpanKind, Status, StatusCode
        from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
    except ImportError:
        # A collector was configured but the packages are not installed, which
        # is what an image built with `--no-dev` looks like if it is ever given
        # an endpoint. Say so once and carry on doing the actual work.
        log.warning("OTLP endpoint configured but opentelemetry is not installed; not tracing")
        return _NoTelemetry()

    if processor is None:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        processor = BatchSpanProcessor(OTLPSpanExporter())

    # Deliberately not installed as the global provider: nothing here reads an
    # ambient span, and staying out of the globals keeps two of these in one
    # process (which is what the tests do) from being one.
    provider = TracerProvider(
        resource=Resource.create(
            {"service.name": environment.get("OTEL_SERVICE_NAME") or "akapela-worker"}
        )
    )
    provider.add_span_processor(processor)
    log.info("tracing job spans to %s", endpoint)
    tracer = provider.get_tracer("akapela_worker")
    propagator = TraceContextTextMapPropagator()

    @dataclass
    class _Telemetry:
        enabled: bool = True

        @contextmanager
        def job_span(self, job: Job, trace_parent: str | None) -> Iterator[JobSpan]:
            # The app stamped this on the row when it enqueued the Job. An
            # absent or malformed one leaves an empty context, and the Job gets
            # a trace of its own rather than no span at all.
            parent = (
                propagator.extract({"traceparent": trace_parent})
                if trace_parent
                else None
            )
            with tracer.start_as_current_span(
                f"job {job.type}",
                context=parent,
                kind=SpanKind.CONSUMER,
                attributes={
                    "akapela.job.id": job.id,
                    "akapela.job.type": job.type,
                    **({} if job.target_id is None else {"akapela.job.target_id": job.target_id}),
                },
            ) as span:

                class _JobSpan:
                    def failed(self, exc: BaseException) -> None:
                        span.record_exception(exc)
                        span.set_status(Status(StatusCode.ERROR, str(exc)))

                try:
                    yield _JobSpan()
                except Exception as exc:
                    # Nothing should reach here — the runner catches a handler's
                    # failure and reports it through `failed` — but a span that
                    # closed green on an escaping exception would be a lie.
                    _JobSpan().failed(exc)
                    raise

        def shutdown(self) -> None:
            provider.shutdown()

    return _Telemetry()
