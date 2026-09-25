CREATE TABLE `queue_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`singer_name` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
