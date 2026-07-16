CREATE TABLE `channel_routes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` integer NOT NULL,
	`scope` text DEFAULT 'all' NOT NULL,
	`target_id` text,
	`min_severity` text DEFAULT 'warning' NOT NULL,
	`alert_kinds` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
