# 02: The Separation Model catalog

**What to build:** One model becomes a catalog to pick from (ADR 0008 amendment).

- A catalog of MDX-Net Separation Models, each with a display name, a one-line description (speed, quality, frequency cutoff), its `MdxNetConfig`, its download URL, and its expected hash. `Inst_Main` and `Inst_HQ_3` go in for certain. `Inst_HQ_4` and `Kim_Vocal_2` go in only if their config values can be verified the way ADR 0008 demands, against `audio-separator`'s hash-keyed `mdx_model_data` registry and the ONNX graph's declared input shape. A model whose config can't be verified is left out, not guessed.
- Settings' **Separation** section gains **Separation Model**, defaulting to `Inst_Main`.
- A Separation records its Separation Model **when it's asked for**. Changing the default afterwards doesn't touch Separations already queued. The Jobs page row shows the model.
- A model not yet in `cache/` is downloaded by the Separation that first needs it, and the Job's state on the Jobs page says so. A failed download fails that Separation with the existing error handling. Nothing new is bundled.
- On success, the Separation Model is stored with the Track's Stems. The Track page shows "Separated with Inst_HQ_3". Stems made before this ticket are recorded as `Inst_Main`, since that's the only model that could have made them.
- Every Separation, including those from a Playlist Import, uses the default unless it was asked for with another.

**Blocked by:** —

**Status:** done

- [x] Every catalog entry's config is backed by a registry entry and the ONNX shape, cited in a comment the way `UVR_MDX_NET_INST_MAIN_CONFIG` is
- [x] The default Separation Model is a setting, and `Inst_Main` when never set
- [x] A Separation queued before the default changes still runs with the model it was queued with
- [x] The Jobs page shows each Separation's model, and a download in progress
- [x] Existing Stems read as `Inst_Main` after the migration
- [x] The Track page names the model that made its Stems
- [x] A test runs the pipeline with a fake session for a second config and checks chunking follows that config's `nFft`/`dimF`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments

- 2026-09-29: All four models went in. Each was downloaded, its partial MD5 (the last 10,000 KiB) looked up in UVR's `model_data_new.json`, and its ONNX input shape read with onnxruntime:

  | Model | Partial MD5 | nFft | dimF | Primary Stem | Cutoff |
  | --- | --- | --- | --- | --- | --- |
  | `Inst_Main` | `1c56ec02…` | 5120 | 2048 | Instrumental | 17.6 kHz |
  | `Inst_HQ_3` | `55657dd7…` | 6144 | 3072 | Instrumental | 22.05 kHz |
  | `Inst_HQ_4` | `0f2a6bc5…` | 5120 | 2560 | Instrumental | 22.05 kHz |
  | `Kim_Vocal_2` | `970b3f94…` | 7680 | 3072 | Vocals | 17.6 kHz |

  One model call on this machine's CPU (16 threads) takes 1.19 s, 1.68 s, 1.41 s, and 1.66 s. The descriptions' "about 1.2× / 1.5× slower" come from those timings.
- `Kim_Vocal_2`'s output is the Vocals Stem, so `MdxNetConfig` gained `primaryStem`, and the subtraction produces whichever Stem the model doesn't. A download is now checked against the partial MD5 before it's kept, and is streamed rather than buffered. The model is on the Job row (`jobs.separation_model`), fixed by `startSeparation`, and a retry keeps it. A one-line `jobs.detail` says "Downloading Inst_HQ_3" while a model arrives. `tracks.stems_model` is written with the Stems. The migration backfills `Inst_Main` for any Track that was ever separated, and the reader falls back to it as well.
