# 09: The STFT's sign convention

**What to decide:** Should the Separation feed the model `torch.stft`'s spectra, or keep what this port has always fed it, the complex conjugate of each frame?

Ticket 08 found this while replacing `ndarray-fft`. `ndarray-fft` transforms with e^(+i), and `torch.stft`, which UVR and `audio-separator` use, transforms with e^(−i). So since the TypeScript port, `Inst_Main` has seen the imaginary planes of every spectrogram with their sign flipped. The inverse flipped them back, so the round trip was exact, and nothing in the audio sounds broken. The port's own validation (`.scratch/worker-to-typescript/issues/05`) used two sine tones, which can't tell the two conventions apart. It reached 0.999 against Python.

Ticket 08 was a speed-up held to 0.999 correlation with the Stems the code already made, so it kept the convention (`stft.ts` says so). Switching conventions moves `Inst_Main`'s Instrumental on the reference song to 0.990 correlation, so it is a change in output, not a refactor.

**Evidence so far (2026-09-29):** the same synthetic 12 s song as the reference fixture, with the true Instrumental and Vocals known, separated both ways on the CPU (SDR against the truth, left channel):

| Model | Convention | Instrumental SDR | Vocals SDR |
| --- | --- | --- | --- |
| `Inst_Main` | port (conjugated) | 2.73 dB | 3.25 dB |
| `Inst_Main` | `torch.stft` | 1.92 dB | 2.43 dB |
| `Kim_Vocal_2` | port (conjugated) | −0.64 dB | 0.01 dB |
| `Kim_Vocal_2` | `torch.stft` | −0.65 dB | 0.00 dB |

That's no case for switching, but synthetic tones and noise aren't what these models were trained on. The deciding test is real music against `audio-separator`'s own output. It needs Python with torch, which this machine's environment doesn't have installed.

**Blocked by:** —

**Status:** needs-triage

- [ ] A few real songs separated by `audio-separator` (`UVR-MDX-NET-Inst_Main.onnx`), compared with Akapela's output under both conventions
- [ ] A decision recorded in ADR 0008's amendment: keep the port's convention, or switch and regenerate `tests/fixtures/separation/`'s reference Stems in the same change

## Comments
