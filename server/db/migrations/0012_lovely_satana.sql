CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pitch_semitones` integer NOT NULL,
	`tempo_percent` integer NOT NULL,
	`linked` integer NOT NULL,
	`reverb_amount` integer NOT NULL,
	`lowpass_hz` integer NOT NULL,
	`built_in` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- The three built-ins the spec names (§Presets). `pitch_semitones` is 0 and
-- unused on the two linked ones, since a linked Adjustments ignores it in
-- favor of following tempo. Static ids and timestamps: these rows exist from
-- this migration onward on every install, not from whenever one happened to run.
INSERT INTO `presets` (`id`, `name`, `pitch_semitones`, `tempo_percent`, `linked`, `reverb_amount`, `lowpass_hz`, `built_in`, `created_at`, `updated_at`) VALUES
	('preset-slowed-and-reverb', 'Slowed and Reverb', 0, 85, 1, 65, 8000, 1, 0, 0),
	('preset-nightcore', 'Nightcore', 0, 130, 1, 20, 20000, 1, 0, 0),
	('preset-practice', 'Practice', 0, 80, 0, 0, 20000, 1, 0, 0);
