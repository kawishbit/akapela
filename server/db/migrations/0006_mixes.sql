CREATE TABLE `mixes` (
	`id` text PRIMARY KEY NOT NULL,
	`take_id` text NOT NULL,
	`mp3_path` text,
	`wav_path` text,
	`wav_requested` integer DEFAULT false NOT NULL,
	`pitch_semitones` integer NOT NULL,
	`tempo_percent` integer NOT NULL,
	`linked` integer NOT NULL,
	`latency_nudge_ms` integer NOT NULL,
	`vocal_gain` real NOT NULL,
	`backing_gain` real NOT NULL,
	`job_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`take_id`) REFERENCES `takes`(`id`) ON UPDATE no action ON DELETE cascade
);
