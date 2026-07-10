ALTER TABLE `alert_settings` ADD `renotify_minutes` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `incidents` ADD `last_notified_at` integer;--> statement-breakpoint
ALTER TABLE `incidents` ADD `notify_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `renotify_minutes` integer;