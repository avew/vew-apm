CREATE TABLE `metric_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `metric_sources_monitor_idx` ON `metric_sources` (`monitor_id`);--> statement-breakpoint
ALTER TABLE `metric_rules` ADD `source_id` integer REFERENCES metric_sources(id);