# 02: The Separation Model catalog

**What to build:** One model becomes a catalog to pick from (ADR 0008 amendment).

- A catalog of MDX-Net Separation Models, each with a display name, a one-line description (speed, quality, frequency cutoff), its `MdxNetConfig`, its download URL, and its expected hash. `Inst_Main` and `Inst_HQ_3` go in for certain. `Inst_HQ_4` and `Kim_Vocal_2` go in only if their config values can be verified the way ADR 0008 demands, against `audio-separator`'s hash-keyed `mdx_model_data` registry and the ONNX graph's declared input shape. A model whose config can't be verified is left out, not guessed.
- Settings' **Separation** section gains **Separation Model**, defaulting to `Inst_Main`.
- A Separation records its Separation Model **when it's asked for**. Changing the default afterwards doesn't touch Separations already queued. The Jobs page row shows the model.
- A model not yet in `cache/` is downloaded by the Separation that first needs it, and the Job's state on the Jobs page says so. A failed download fails that Separation with the existing error handling. Nothing new is bundled.
- On success, the Separation Model is stored with the Track's Stems. The Track page shows "Separated with Inst_HQ_3". Stems made before this ticket are recorded as `Inst_Main`, since that's the only model that could have made them.
- Every Separation, including those from a Playlist Import, uses the default unless it was asked for with another.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] Every catalog entry's config is backed by a registry entry and the ONNX shape, cited in a comment the way `UVR_MDX_NET_INST_MAIN_CONFIG` is
- [ ] The default Separation Model is a setting, and `Inst_Main` when never set
- [ ] A Separation queued before the default changes still runs with the model it was queued with
- [ ] The Jobs page shows each Separation's model, and a download in progress
- [ ] Existing Stems read as `Inst_Main` after the migration
- [ ] The Track page names the model that made its Stems
- [ ] A test runs the pipeline with a fake session for a second config and checks chunking follows that config's `nFft`/`dimF`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## Comments
