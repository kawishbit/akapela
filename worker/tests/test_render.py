"""The render job: a Take's dry vocal placed on its Adjustments-applied Backing Track."""

from __future__ import annotations

import json
import math
import subprocess
import wave
from array import array
from pathlib import Path

import pytest

from akapela_worker.audio import (
    LOWPASS_HZ_BYPASSED,
    REVERB_AMOUNT_BYPASSED,
    _append_effects,
)
from akapela_worker.runner import Runner

from .conftest import get_job

TRACK_ID = "t1"
TAKE_ID = "take1"


def write_sine_wav(
    path: Path, *, frequency: float, seconds: float, sample_rate: int = 44100
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={frequency}:duration={seconds}",
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        check=True,
    )


def write_burst_then_silence_wav(
    path: Path,
    *,
    frequency: float,
    burst_seconds: float,
    total_seconds: float,
    sample_rate: int = 44100,
) -> None:
    """A short tone followed by silence out to `total_seconds`, so a window after
    the burst is where dry silence and a reverb tail tell apart."""
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={frequency}:duration={burst_seconds}",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r={sample_rate}:cl=stereo:d={total_seconds - burst_seconds}",
            "-filter_complex",
            "[0:a]aformat=channel_layouts=stereo[a0];[a0][1:a]concat=n=2:v=0:a=1[cat]",
            "-map",
            "[cat]",
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        check=True,
    )


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return json.loads(out)


def rms_window(path: Path, start_seconds: float, end_seconds: float) -> float:
    """Root-mean-square amplitude of a 16-bit PCM WAV between two timestamps, across channels."""
    with wave.open(str(path), "rb") as wav:
        sample_rate = wav.getframerate()
        start_frame = max(0, round(start_seconds * sample_rate))
        end_frame = min(wav.getnframes(), round(end_seconds * sample_rate))
        wav.setpos(start_frame)
        frames = wav.readframes(max(0, end_frame - start_frame))
    samples = array("h")
    samples.frombytes(frames)
    if not samples:
        return 0.0
    return math.sqrt(sum(s * s for s in samples) / len(samples))


def insert_track(conn, *, track_id: str = TRACK_ID) -> None:
    conn.execute(
        "INSERT INTO tracks (id, title, artist, duration_ms, cover_path, source_kind,"
        " source_ref, import_state, created_at, updated_at)"
        " VALUES (?, 'Sine Song', NULL, NULL, 'cover.svg', 'upload', 'sine.wav',"
        " 'ready', 1000, 1000)",
        (track_id,),
    )


def insert_take(
    conn,
    *,
    take_id: str = TAKE_ID,
    track_id: str = TRACK_ID,
    file_path: str,
    start_position_ms: int,
    duration_ms: int,
    tempo_percent: int = 100,
) -> None:
    adjustments = json.dumps({"pitchSemitones": 0, "tempoPercent": tempo_percent, "linked": False})
    conn.execute(
        "INSERT INTO takes (id, track_id, start_position_ms, duration_ms, file_path, adjustments,"
        " latency_nudge_ms, vocal_gain, backing_gain, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, 1000, 1000)",
        (take_id, track_id, start_position_ms, duration_ms, file_path, adjustments),
    )


def insert_mix(
    conn,
    *,
    mix_id: str,
    take_id: str = TAKE_ID,
    job_id: str,
    tempo_percent: int = 100,
    pitch_semitones: int = 0,
    linked: bool = False,
    reverb_amount: int = 0,
    lowpass_hz: int = 20000,
    effects_target: str = "backing",
    backing_source: str = "original",
    latency_nudge_ms: int = 0,
    vocal_gain: float = 1.0,
    backing_gain: float = 1.0,
    wav_requested: bool = False,
) -> None:
    conn.execute(
        "INSERT INTO mixes (id, take_id, mp3_path, wav_path, wav_requested, pitch_semitones,"
        " tempo_percent, linked, reverb_amount, lowpass_hz, effects_target, backing_source,"
        " latency_nudge_ms, vocal_gain, backing_gain, job_id, created_at, updated_at)"
        " VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1000, 1000)",
        (
            mix_id,
            take_id,
            int(wav_requested),
            pitch_semitones,
            tempo_percent,
            int(linked),
            reverb_amount,
            lowpass_hz,
            effects_target,
            backing_source,
            latency_nudge_ms,
            vocal_gain,
            backing_gain,
            job_id,
        ),
    )


def enqueue_render(conn, *, mix_id: str, job_id: str = "j1") -> None:
    conn.execute(
        "INSERT INTO jobs (id, type, target_id, state, progress, error, created_at)"
        " VALUES (?, 'render', ?, 'queued', 0, NULL, 1000)",
        (job_id, mix_id),
    )


def get_mix(conn, mix_id: str = "m1"):
    row = conn.execute("SELECT * FROM mixes WHERE id = ?", (mix_id,)).fetchone()
    assert row is not None
    return row


def test_render_covers_the_full_backing_track_with_vocal_energy_at_the_start_position(
    conn, data_dir: Path
):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=4.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=1.0)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=1000, duration_ms=1000)
    insert_mix(conn, mix_id="m1", job_id="j1")
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "succeeded", job["error"]

    mix = get_mix(conn)
    assert mix["mp3_path"] == "mixes/m1.mp3"
    assert mix["wav_path"] is None

    mp3 = track_dir / "mixes" / "m1.mp3"
    assert mp3.exists()
    assert abs(float(probe(mp3)["format"]["duration"]) - 4.0) < 0.2
    # No WAV was requested, so only the MP3 was written.
    assert not (track_dir / "mixes" / "m1.wav").exists()


def test_a_requested_wav_covers_the_full_backing_track_with_vocal_energy_at_start_plus_nudge(
    conn, data_dir: Path
):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=4.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=1.0)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=1000, duration_ms=1000)
    # A nudge shifts the vocal 200ms later than the Take's own start position.
    insert_mix(conn, mix_id="m1", job_id="j1", latency_nudge_ms=200, wav_requested=True)
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    wav = track_dir / "mixes" / "m1.wav"
    assert wav.exists()
    assert abs(float(probe(wav)["format"]["duration"]) - 4.0) < 0.05

    baseline = rms_window(wav, 0.0, 0.9)
    during_vocal = rms_window(wav, 1.5, 1.9)
    after_vocal = rms_window(wav, 2.5, 3.5)
    assert during_vocal > baseline * 1.2
    assert after_vocal < during_vocal


def test_a_faster_tempo_shrinks_both_the_mix_and_the_vocal_placement(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=4.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=1.0)
    insert_track(conn)
    # Sung at double tempo: the Take's own Adjustments record 200%.
    insert_take(
        conn,
        file_path="takes/take1.wav",
        start_position_ms=1000,
        duration_ms=1000,
        tempo_percent=200,
    )
    insert_mix(conn, mix_id="m1", job_id="j1", tempo_percent=200, wav_requested=True)
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    wav = track_dir / "mixes" / "m1.wav"
    # 4s of song time at double tempo plays back in half the wall-clock time.
    assert abs(float(probe(wav)["format"]["duration"]) - 2.0) < 0.05

    baseline = rms_window(wav, 0.0, 0.4)
    # The 1000ms song-time start position also halves to 500ms of wall time.
    during_vocal = rms_window(wav, 0.6, 0.9)
    assert during_vocal > baseline * 1.2


def test_a_large_negative_nudge_trims_the_vocal_instead_of_going_negative(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=4.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=1.0)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=300, duration_ms=1000)
    # start (300ms) + nudge (-500ms) is negative: the first 200ms of the vocal is trimmed away.
    insert_mix(conn, mix_id="m1", job_id="j1", latency_nudge_ms=-500, wav_requested=True)
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    wav = track_dir / "mixes" / "m1.wav"
    assert abs(float(probe(wav)["format"]["duration"]) - 4.0) < 0.05
    # The remaining 0.8s of vocal plays from wall time zero.
    assert rms_window(wav, 0.0, 0.7) > rms_window(wav, 1.5, 2.5) * 1.2


def test_vocal_gain_changes_the_relative_level_of_the_vocal(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=3.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=1.0)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=1000, duration_ms=1000)
    # Backing muted in both renders, so the window's RMS is the vocal alone —
    # an unmuted backing floor would otherwise compress how visible the ratio is.
    insert_mix(
        conn, mix_id="quiet", job_id="j1", vocal_gain=0.1, backing_gain=0.0, wav_requested=True
    )
    insert_mix(
        conn, mix_id="loud", job_id="j2", vocal_gain=1.8, backing_gain=0.0, wav_requested=True
    )
    enqueue_render(conn, mix_id="quiet", job_id="j1")
    enqueue_render(conn, mix_id="loud", job_id="j2")
    conn.commit()

    runner = Runner(conn, data_dir)
    runner.run_once()
    runner.run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]

    quiet_rms = rms_window(track_dir / "mixes" / "quiet.wav", 1.2, 1.8)
    loud_rms = rms_window(track_dir / "mixes" / "loud.wav", 1.2, 1.8)
    assert loud_rms > quiet_rms * 3


def test_backing_gain_changes_the_relative_level_of_the_backing(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=3.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=1.0)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=1000, duration_ms=1000)
    # Vocal muted in both renders, isolating the backing's own level.
    insert_mix(
        conn, mix_id="quiet", job_id="j1", vocal_gain=0.0, backing_gain=0.2, wav_requested=True
    )
    insert_mix(
        conn, mix_id="loud", job_id="j2", vocal_gain=0.0, backing_gain=1.6, wav_requested=True
    )
    enqueue_render(conn, mix_id="quiet", job_id="j1")
    enqueue_render(conn, mix_id="loud", job_id="j2")
    conn.commit()

    runner = Runner(conn, data_dir)
    runner.run_once()
    runner.run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]

    quiet_rms = rms_window(track_dir / "mixes" / "quiet.wav", 0.0, 0.5)
    loud_rms = rms_window(track_dir / "mixes" / "loud.wav", 0.0, 0.5)
    assert loud_rms > quiet_rms * 3


def test_render_of_a_deleted_mix_fails_the_job(conn, data_dir: Path):
    enqueue_render(conn, mix_id="nope", job_id="j1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "nope" in job["error"]


def test_a_mix_deleted_during_render_leaves_no_orphan_files(conn, data_dir: Path, monkeypatch):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=1.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.5)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=0, duration_ms=500)
    insert_mix(conn, mix_id="m1", job_id="j1", wav_requested=True)
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    from akapela_worker.runner import JobContext

    original_progress = JobContext.progress

    def progress_then_delete(self: JobContext, percent: int) -> None:
        original_progress(self, percent)
        if percent == 80:
            # Stand in for the app: the singer deleted the Mix while the job ran.
            conn.execute("DELETE FROM mixes WHERE id = 'm1'")

    monkeypatch.setattr(JobContext, "progress", progress_then_delete)

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "deleted" in job["error"]
    assert not (track_dir / "mixes" / "m1.mp3").exists()
    assert not (track_dir / "mixes" / "m1.wav").exists()


def test_a_missing_take_recording_records_the_error_on_the_job(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=2.0)
    insert_track(conn)
    # The Take row exists but its WAV was never written.
    insert_take(conn, file_path="takes/missing.wav", start_position_ms=0, duration_ms=1000)
    insert_mix(conn, mix_id="m1", job_id="j1")
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert get_mix(conn)["mp3_path"] is None
    assert not (track_dir / "mixes" / "m1.mp3").exists()


@pytest.mark.parametrize("field", ["progress"])
def test_render_reports_progress_before_finishing(
    conn, data_dir: Path, field: str, monkeypatch: pytest.MonkeyPatch
):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=1.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.5)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=0, duration_ms=500)
    insert_mix(conn, mix_id="m1", job_id="j1")
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    from akapela_worker.runner import JobContext

    seen: list[int] = []
    original_progress = JobContext.progress

    def recording_progress(self: JobContext, percent: int) -> None:
        seen.append(percent)
        original_progress(self, percent)

    monkeypatch.setattr(JobContext, "progress", recording_progress)

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded"
    assert seen[0] < 100
    assert any(0 < p < 100 for p in seen)


def test_reverb_raises_energy_in_the_tail_after_the_last_input_sample(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_burst_then_silence_wav(
        track_dir / "backing.wav", frequency=220, burst_seconds=0.3, total_seconds=3.0
    )
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.1)
    insert_track(conn)
    # A vocal placed at the very end, out of the way of the window under test.
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=2900, duration_ms=100)
    insert_mix(conn, mix_id="m1", job_id="j1", reverb_amount=65, wav_requested=True)
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    wav = track_dir / "mixes" / "m1.wav"
    # The dry backing is silent here; a reverb tail is not.
    assert rms_window(wav, 0.5, 1.0) > 0


def test_no_reverb_leaves_the_tail_silent(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_burst_then_silence_wav(
        track_dir / "backing.wav", frequency=220, burst_seconds=0.3, total_seconds=3.0
    )
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.1)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=2900, duration_ms=100)
    insert_mix(conn, mix_id="m1", job_id="j1", reverb_amount=0, wav_requested=True)
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    wav = track_dir / "mixes" / "m1.wav"
    assert rms_window(wav, 0.5, 1.0) == 0


def test_lowpass_measurably_reduces_high_frequency_energy(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=8000, seconds=2.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.1)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=1900, duration_ms=100)
    insert_mix(conn, mix_id="filtered", job_id="j1", lowpass_hz=1000, wav_requested=True)
    insert_mix(conn, mix_id="unfiltered", job_id="j2", lowpass_hz=20000, wav_requested=True)
    enqueue_render(conn, mix_id="filtered", job_id="j1")
    enqueue_render(conn, mix_id="unfiltered", job_id="j2")
    conn.commit()

    runner = Runner(conn, data_dir)
    runner.run_once()
    runner.run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]

    filtered_rms = rms_window(track_dir / "mixes" / "filtered.wav", 0.2, 1.5)
    unfiltered_rms = rms_window(track_dir / "mixes" / "unfiltered.wav", 0.2, 1.5)
    assert filtered_rms < unfiltered_rms * 0.5


def test_defaults_produce_output_matching_the_no_effects_path(conn, data_dir: Path):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=2.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.5)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=500, duration_ms=500)
    # One Mix at the schema's own bypassed defaults, one naming them explicitly.
    insert_mix(conn, mix_id="implicit", job_id="j1", wav_requested=True)
    insert_mix(
        conn,
        mix_id="explicit",
        job_id="j2",
        reverb_amount=0,
        lowpass_hz=20000,
        wav_requested=True,
    )
    enqueue_render(conn, mix_id="implicit", job_id="j1")
    enqueue_render(conn, mix_id="explicit", job_id="j2")
    conn.commit()

    runner = Runner(conn, data_dir)
    runner.run_once()
    runner.run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]

    implicit_bytes = (track_dir / "mixes" / "implicit.wav").read_bytes()
    explicit_bytes = (track_dir / "mixes" / "explicit.wav").read_bytes()
    assert implicit_bytes == explicit_bytes


def test_a_mix_renders_against_its_own_backing_source_even_if_the_track_has_moved_on(
    conn, data_dir: Path
):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=2.0)
    write_sine_wav(track_dir / "instrumental.wav", frequency=330, seconds=2.0)
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.5)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=500, duration_ms=500)
    insert_mix(conn, mix_id="m1", job_id="j1", backing_source="instrumental", wav_requested=True)
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "succeeded", job["error"]
    assert (track_dir / "mixes" / "m1.wav").exists()


def test_rendering_against_a_deleted_instrumental_stem_fails_with_a_message_naming_it(
    conn, data_dir: Path
):
    track_dir = data_dir / "tracks" / TRACK_ID
    write_sine_wav(track_dir / "backing.wav", frequency=220, seconds=2.0)
    # No instrumental.wav on disk: the Stems were deleted after this Mix named them.
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=880, seconds=0.5)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=500, duration_ms=500)
    insert_mix(conn, mix_id="m1", job_id="j1", backing_source="instrumental")
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    job = get_job(conn, "j1")
    assert job["state"] == "failed"
    assert "instrumental" in job["error"]
    assert not (track_dir / "mixes" / "m1.mp3").exists()


def _write_effects_target_inputs(data_dir: Path) -> Path:
    """A backing and a vocal that each burst briefly and then fall silent, in
    windows that do not overlap. Whatever energy shows up in a signal's own
    silent window afterwards is its reverb tail and nothing else, which is how
    a target that reaches one side but not the other is told apart."""
    track_dir = data_dir / "tracks" / TRACK_ID
    write_burst_then_silence_wav(
        track_dir / "backing.wav", frequency=220, burst_seconds=0.3, total_seconds=4.0
    )
    write_burst_then_silence_wav(
        track_dir / "takes" / "take1.wav", frequency=880, burst_seconds=0.3, total_seconds=1.0
    )
    return track_dir


@pytest.mark.parametrize(
    ("effects_target", "backing_tail", "vocal_tail"),
    [
        ("backing", True, False),
        ("vocal", False, True),
        ("both", True, True),
        ("none", False, False),
    ],
)
def test_the_effects_target_decides_which_signals_get_reverb(
    conn, data_dir: Path, effects_target: str, backing_tail: bool, vocal_tail: bool
):
    track_dir = _write_effects_target_inputs(data_dir)
    insert_track(conn)
    # The vocal bursts from 2.0s, well clear of the backing's own burst and tail window.
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=2000, duration_ms=1000)
    insert_mix(
        conn,
        mix_id="m1",
        job_id="j1",
        reverb_amount=65,
        effects_target=effects_target,
        wav_requested=True,
    )
    enqueue_render(conn, mix_id="m1")
    conn.commit()

    Runner(conn, data_dir).run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    wav = track_dir / "mixes" / "m1.wav"
    # Both signals are dry-silent in their own window; only a reverb tail is not.
    assert (rms_window(wav, 0.6, 1.2) > 0) is backing_tail
    assert (rms_window(wav, 2.6, 3.2) > 0) is vocal_tail


@pytest.mark.parametrize(
    ("effects_target", "backing_filtered", "vocal_filtered"),
    [
        ("backing", True, False),
        ("vocal", False, True),
        ("both", True, True),
        ("none", False, False),
    ],
)
def test_the_effects_target_decides_which_signals_get_the_low_pass(
    conn, data_dir: Path, effects_target: str, backing_filtered: bool, vocal_filtered: bool
):
    track_dir = data_dir / "tracks" / TRACK_ID
    # Both signals sit well above the cutoff, so the filter's effect on either
    # is a drop in that signal's own window. The backing falls silent after its
    # burst, which is what keeps the vocal's window the vocal alone.
    write_burst_then_silence_wav(
        track_dir / "backing.wav", frequency=8000, burst_seconds=0.5, total_seconds=4.0
    )
    write_sine_wav(track_dir / "takes" / "take1.wav", frequency=8000, seconds=1.0)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=2000, duration_ms=1000)
    insert_mix(
        conn,
        mix_id="filtered",
        job_id="j1",
        lowpass_hz=1000,
        effects_target=effects_target,
        wav_requested=True,
    )
    # The same Mix with the Effects reaching nothing, as the level to compare against.
    insert_mix(
        conn, mix_id="dry", job_id="j2", lowpass_hz=1000, effects_target="none", wav_requested=True
    )
    enqueue_render(conn, mix_id="filtered", job_id="j1")
    enqueue_render(conn, mix_id="dry", job_id="j2")
    conn.commit()

    runner = Runner(conn, data_dir)
    runner.run_once()
    runner.run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]

    filtered = track_dir / "mixes" / "filtered.wav"
    dry = track_dir / "mixes" / "dry.wav"
    # One window holds the backing's burst alone, the other the vocal's alone.
    backing_only = (0.1, 0.4)
    vocal_only = (2.2, 2.9)
    assert (rms_window(filtered, *backing_only) < rms_window(dry, *backing_only) * 0.5) is (
        backing_filtered
    )
    assert (rms_window(filtered, *vocal_only) < rms_window(dry, *vocal_only) * 0.5) is (
        vocal_filtered
    )


def test_the_default_target_renders_exactly_what_backing_only_effects_render(conn, data_dir: Path):
    """The target defaults to the Backing Track, which is all the Effects ever
    reached, so a Mix row written before the column existed renders unchanged."""
    track_dir = _write_effects_target_inputs(data_dir)
    insert_track(conn)
    insert_take(conn, file_path="takes/take1.wav", start_position_ms=2000, duration_ms=1000)
    insert_mix(
        conn, mix_id="implicit", job_id="j1", reverb_amount=65, lowpass_hz=4000, wav_requested=True
    )
    insert_mix(
        conn,
        mix_id="explicit",
        job_id="j2",
        reverb_amount=65,
        lowpass_hz=4000,
        effects_target="backing",
        wav_requested=True,
    )
    enqueue_render(conn, mix_id="implicit", job_id="j1")
    enqueue_render(conn, mix_id="explicit", job_id="j2")
    conn.commit()

    runner = Runner(conn, data_dir)
    runner.run_once()
    runner.run_once()

    assert get_job(conn, "j1")["state"] == "succeeded", get_job(conn, "j1")["error"]
    assert get_job(conn, "j2")["state"] == "succeeded", get_job(conn, "j2")["error"]
    assert (track_dir / "mixes" / "implicit.wav").read_bytes() == (
        track_dir / "mixes" / "explicit.wav"
    ).read_bytes()


def test_a_signal_the_effects_target_misses_gets_the_filter_graph_it_had_before_effects():
    """What the no-regression promise rests on: at the bypassed values nothing
    is appended at all, so the graph is the string it was when the Effects only
    ever reached the Backing Track."""
    segments = ["[0:a]rubberband=tempo=1.0:pitch=1.0[stretched]"]

    label = _append_effects(
        segments,
        label="stretched",
        prefix="bg",
        reverb_amount=REVERB_AMOUNT_BYPASSED,
        lowpass_hz=LOWPASS_HZ_BYPASSED,
        impulse_label="[2:a]",
    )

    assert label == "stretched"
    assert segments == ["[0:a]rubberband=tempo=1.0:pitch=1.0[stretched]"]


def test_both_effects_are_built_reverb_first_then_low_pass():
    """The order ADR 0003 pins on both engines, and the labels each side hands on."""
    segments: list[str] = []

    label = _append_effects(
        segments,
        label="voc",
        prefix="voc",
        reverb_amount=65,
        lowpass_hz=4000,
        impulse_label="[ir_voc]",
    )

    assert label == "voc_lp"
    assert segments == [
        "[voc]asplit=2[voc_dry][voc_wet_in]",
        "[voc_wet_in][ir_voc]afir=dry=1:wet=1[voc_wet]",
        "[voc_dry][voc_wet]amix=inputs=2:weights=0.350000 0.650000:normalize=0[voc_reverbed]",
        "[voc_reverbed]lowpass=f=4000[voc_lp]",
    ]
