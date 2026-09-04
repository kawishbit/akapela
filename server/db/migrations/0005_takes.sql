CREATE TABLE `takes` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`start_position_ms` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`file_path` text NOT NULL,
	`adjustments` text NOT NULL,
	`latency_nudge_ms` integer DEFAULT 0 NOT NULL,
	`vocal_gain` real DEFAULT 1 NOT NULL,
	`backing_gain` real DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
