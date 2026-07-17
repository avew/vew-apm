ALTER TABLE `metric_rules` ADD `mode` text DEFAULT 'instant' NOT NULL;--> statement-breakpoint
ALTER TABLE `metric_rules` ADD `window_seconds` integer;