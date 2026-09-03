CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`duration_ms` integer,
	`cover_path` text,
	`source_kind` text NOT NULL,
	`source_ref` text NOT NULL,
	`import_state` text DEFAULT 'importing' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
