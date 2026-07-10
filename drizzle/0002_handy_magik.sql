CREATE TABLE `status_page` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`title` text DEFAULT 'Service Status' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `monitors` ADD `public` integer DEFAULT false NOT NULL;