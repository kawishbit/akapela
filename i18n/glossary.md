# Glossary

One rendering for each term the app shows, per Language, so a word means the same thing on every screen. The terms, and what each one means, are in `CONTEXT.md`. Read this before translating a string, and add a term here before using a new rendering of it.

Never translated, in any Language: Lyrics themselves, Track titles and artists, names the singer typed, and the names of services and formats (YouTube, LRCLIB, Genius, Spotify, GitHub, yt-dlp, WAV, FLAC, MP3, M4A, OGG, PNG, JPEG, WebP), Separation Model names (`Inst_Main`, `Kim_Vocal_2`, ...), and the names of built-in Presets (for now; see `.scratch/localisation/`, ticket 09).

## Bahasa Indonesia (`id.json`)

**Register: *kamu*.** Akapela is a karaoke app you use with friends, so it speaks the way music apps in Indonesian do: *kamu*, not *Anda*. Buttons are plain imperatives (*Simpan*, *Hapus*, *Coba lagi*), with no *silakan*.

Capitalised as in English: a `CONTEXT.md` term keeps its capital letters wherever the English has them (*Trek*, *Stem Instrumental*, *Antrean*), so a reader can tell the term from the everyday word.

| English | Indonesian | Why, where it isn't obvious | Avoid |
| --- | --- | --- | --- |
| Library | Pustaka | "Pustaka Kamu" for Your Library. | Perpustakaan (a building), Koleksi |
| Source | Sumber | | Tautan, video |
| Track | Trek | What's in the Library. *Lagu* is kept for Song, so the two stay apart, as they do in English. | Lagu, berkas, item |
| Song | Lagu | The musical work a Track is of, which Lyrics are looked up by. | Metadata, hasil |
| Backing Track | Trek Iringan | *Iringan* is accompaniment: what you sing over. | Minus one, instrumental, beat |
| Backing Source | Sumber Iringan | | Mode iringan |
| Stems | Stem | The music-production loanword, as singular and plural. Instrumental Stem is *Stem Instrumental*, Vocals Stem is *Stem Vokal*. | Lapisan, audio terpisah |
| Stem Levels | Level Stem | *Level*, as audio apps say it; each one is shown as a percentage. | Volume stem, campuran, balance |
| Guide Vocal | Vokal Panduan | The original singer, heard under the Backing Track to sing along to: *panduan* is a guide to follow. Never the singer's own voice. | Vokal latar (backing vocals, in music), vokal asli, referensi |
| Separation | Pemisahan | The verb is *memisahkan*; the button is *Pisahkan*. | Ekstraksi, isolasi |
| Separation Model | Model Pemisahan | | Model (alone), kualitas |
| Audio Format | Format Audio | | Codec, kualitas, jenis berkas |
| Queue | Antrean | The standard (KBBI) spelling. | Antrian, playlist, daftar putar |
| Queue Entry | Entri Antrean | | Permintaan, slot |
| Up next | Berikutnya | | Lagu selanjutnya, sedang diputar |
| Lyrics | Lirik | Synced Lyrics are *Lirik Tersinkron*, Plain Lyrics *Lirik Biasa*. | Teks, subtitel |
| Lyrics Provider | Penyedia Lirik | | Sumber lirik, API |
| Lyrics Offset | Offset Lirik | The loanword is what karaoke and audio apps use; *pergeseran* reads as a movement, not a setting. A judgement call: see ticket 08's comments. | Jeda, koreksi sinkron |
| Adjustments | Penyesuaian | | Pengaturan (that is Settings), filter |
| Effects | Efek | Reverb and Low-pass keep their English names, as audio apps in Indonesian do. | FX, pemrosesan |
| Effects Target | Sasaran Efek | Its choices: *Vokal*, *Iringan*, *Keduanya*, *Tidak ada*. | Routing, bus |
| Preset | Preset | The loanword, as audio apps use it. | Mode, profil |
| Take | Take | The studio word for one recorded attempt, as Indonesian studios use it. *Rekaman* is the audio itself, so it would blur Take into its file. A judgement call: see ticket 08's comments. | Rekaman, sesi, percobaan |
| Mix | Mix | Rendering one is *merender*; the button is the loanword *Render*, as audio apps label it. A judgement call: see ticket 08's comments. | Ekspor, hasil, bounce |
| Monitoring | Monitoring | Hearing yourself in your headphones while you sing, as audio interfaces label it. | Pemutaran, umpan balik |
| Job | Tugas | | Proses, operasi, pekerjaan |
| Playlist Import | Impor Playlist | *Playlist* is the loanword Spotify's own Indonesian uses; a Spotify album is imported the same way and is still one. | Daftar putar, impor massal |
| Language | Bahasa | | Lokal, terjemahan |
| Desktop App | Aplikasi Desktop | | Aplikasi Electron |
| Update | Pembaruan | | Upgrade, patch |
| Release | Rilis | | Versi, build |
| Settings | Pengaturan | | Setelan, konfigurasi |
| pitch | nada | Measured in *semiton*. | pitch |
| tempo | tempo | | kecepatan |
| Latency nudge | Geser latensi | | Delay |
| import (verb) | impor | | unggah (that is upload) |
| singer | penyanyi | | pengguna |
