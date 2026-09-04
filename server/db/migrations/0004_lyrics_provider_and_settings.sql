CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_lyrics_provider` text DEFAULT 'lrclib' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tracks` ADD `lyrics_provider` text DEFAULT 'lrclib' NOT NULL;