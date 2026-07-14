ALTER TABLE `alert_settings` ADD `cert_warn_days` integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE `alert_settings` ADD `cert_crit_days` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `cert_warn_days` integer;--> statement-breakpoint
ALTER TABLE `monitors` ADD `cert_crit_days` integer;--> statement-breakpoint
ALTER TABLE `monitors` ADD `cert_expires_at` integer;--> statement-breakpoint
ALTER TABLE `monitors` ADD `cert_checked_at` integer;