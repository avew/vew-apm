CREATE TABLE `status_incident_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`incident_id` integer NOT NULL,
	`status` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `status_incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `status_incident_update_idx` ON `status_incident_updates` (`incident_id`);--> statement-breakpoint
CREATE TABLE `status_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`impact` text DEFAULT 'minor' NOT NULL,
	`status` text DEFAULT 'investigating' NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
