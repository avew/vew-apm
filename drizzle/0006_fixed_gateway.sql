ALTER TABLE `alert_settings` ADD `slo_target` real DEFAULT 99.9 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `slo_target` real;