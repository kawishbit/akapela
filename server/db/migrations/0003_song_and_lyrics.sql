CREATE TABLE `lyrics` (
	`track_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`lines` text NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `tracks` ADD `song_artist` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `song_title` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `song_provider_ids` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `song_album_art_url` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `lyrics_offset_ms` integer DEFAULT 0 NOT NULL;