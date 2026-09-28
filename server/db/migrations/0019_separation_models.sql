ALTER TABLE `jobs` ADD `separation_model` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `detail` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `separation_model` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `stems_model` text;--> statement-breakpoint
-- Stems made before there was a choice could only have come from Inst_Main.
UPDATE `tracks` SET `stems_model` = 'Inst_Main' WHERE `separation_state` != 'none';