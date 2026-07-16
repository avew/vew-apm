ALTER TABLE `incidents` ADD `acked_at` integer;--> statement-breakpoint
ALTER TABLE `incidents` ADD `acked_by` text;--> statement-breakpoint
ALTER TABLE `incidents` ADD `snoozed_until` integer;