ALTER TABLE `monitors` ADD `type` text DEFAULT 'actuator' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `expect_status` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `keyword` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `status_path` text;--> statement-breakpoint
ALTER TABLE `monitors` ADD `status_up_value` text;