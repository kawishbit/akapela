"""Telemetry is off unless something is collecting, and says so when it is on."""

from __future__ import annotations

from akapela_worker.runner import Job
from akapela_worker.telemetry import configure

TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


def test_no_collector_means_no_telemetry():
    telemetry = configure({})
    assert telemetry.enabled is False


def test_a_disabled_telemetry_still_wraps_a_job_so_the_runner_needs_no_branch():
    telemetry = configure({})
    with telemetry.job_span(Job(id="j1", type="noop", target_id=None), TRACEPARENT):
        pass


def test_a_collector_turns_it_on():
    telemetry = configure(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318", "OTEL_SERVICE_NAME": "worker"}
    )
    try:
        assert telemetry.enabled is True
    finally:
        telemetry.shutdown()


def test_a_job_is_one_span_named_for_its_type():
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    telemetry = configure(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318"},
        processor=SimpleSpanProcessor(exporter),
    )
    try:
        with telemetry.job_span(Job(id="j1", type="import", target_id="t1"), None):
            pass
    finally:
        telemetry.shutdown()

    (span,) = exporter.get_finished_spans()
    assert span.name == "job import"
    assert span.attributes["akapela.job.id"] == "j1"
    assert span.attributes["akapela.job.type"] == "import"
    assert span.attributes["akapela.job.target_id"] == "t1"


def test_a_job_span_joins_the_trace_of_the_request_that_enqueued_it():
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    telemetry = configure(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318"},
        processor=SimpleSpanProcessor(exporter),
    )
    try:
        with telemetry.job_span(Job(id="j1", type="render", target_id="m1"), TRACEPARENT):
            pass
    finally:
        telemetry.shutdown()

    (span,) = exporter.get_finished_spans()
    assert format(span.context.trace_id, "032x") == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert format(span.parent.span_id, "016x") == "00f067aa0ba902b7"


def test_an_unusable_traceparent_still_gets_a_span_of_its_own():
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    telemetry = configure(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318"},
        processor=SimpleSpanProcessor(exporter),
    )
    try:
        with telemetry.job_span(Job(id="j1", type="noop", target_id=None), "nonsense"):
            pass
    finally:
        telemetry.shutdown()

    (span,) = exporter.get_finished_spans()
    assert span.parent is None


def test_a_failed_job_is_a_failed_span():
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    from opentelemetry.trace import StatusCode

    exporter = InMemorySpanExporter()
    telemetry = configure(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:4318"},
        processor=SimpleSpanProcessor(exporter),
    )
    try:
        try:
            with telemetry.job_span(Job(id="j1", type="import", target_id=None), None):
                raise RuntimeError("yt-dlp exploded")
        except RuntimeError:
            pass
    finally:
        telemetry.shutdown()

    (span,) = exporter.get_finished_spans()
    assert span.status.status_code is StatusCode.ERROR
    assert any(event.name == "exception" for event in span.events)
