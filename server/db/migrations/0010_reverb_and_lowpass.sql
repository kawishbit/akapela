PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`duration_ms` integer,
	`cover_path` text,
	`source_kind` text NOT NULL,
	`source_ref` text NOT NULL,
	`import_state` text DEFAULT 'importing' NOT NULL,
	`separation_state` text DEFAULT 'none' NOT NULL,
	`backing_source` text DEFAULT 'original' NOT NULL,
	`adjustments` text DEFAULT '{"pitchSemitones":0,"tempoPercent":100,"linked":false,"reverbAmount":0,"lowpassHz":20000}' NOT NULL,
	`song_artist` text,
	`song_title` text,
	`song_provider_ids` text,
	`song_album_art_url` text,
	`lyrics_provider` text DEFAULT 'lrclib' NOT NULL,
	`lyrics_offset_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tracks`("id", "title", "artist", "duration_ms", "cover_path", "source_kind", "source_ref", "import_state", "separation_state", "backing_source", "adjustments", "song_artist", "song_title", "song_provider_ids", "song_album_art_url", "lyrics_provider", "lyrics_offset_ms", "created_at", "updated_at") SELECT "id", "title", "artist", "duration_ms", "cover_path", "source_kind", "source_ref", "import_state", "separation_state", "backing_source", "adjustments", "song_artist", "song_title", "song_provider_ids", "song_album_art_url", "lyrics_provider", "lyrics_offset_ms", "created_at", "updated_at" FROM `tracks`;--> statement-breakpoint
DROP TABLE `tracks`;--> statement-breakpoint
ALTER TABLE `__new_tracks` RENAME TO `tracks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;