ALTER TABLE `mixes` ADD `backing_source` text DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE `takes` ADD `backing_source` text DEFAULT 'original' NOT NULL;