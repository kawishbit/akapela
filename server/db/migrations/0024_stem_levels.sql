ALTER TABLE `mixes` ADD `stem_levels` text DEFAULT '{"guideVocal":0,"instrumental":1}' NOT NULL;--> statement-breakpoint
ALTER TABLE `takes` ADD `stem_levels` text DEFAULT '{"guideVocal":0,"instrumental":1}' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `stem_levels` text DEFAULT '{"guideVocal":0,"instrumental":1}' NOT NULL;--> statement-breakpoint
UPDATE `tracks` SET `backing_source` = 'stems' WHERE `backing_source` = 'instrumental';--> statement-breakpoint
UPDATE `takes` SET `backing_source` = 'stems' WHERE `backing_source` = 'instrumental';--> statement-breakpoint
UPDATE `mixes` SET `backing_source` = 'stems' WHERE `backing_source` = 'instrumental';
