CREATE TABLE `alert_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`disk_warn_pct` real DEFAULT 60 NOT NULL,
	`disk_crit_pct` real DEFAULT 85 NOT NULL,
	`down_for_minutes` integer DEFAULT 3 NOT NULL,
	`latency_warn_ms` integer DEFAULT 2000 NOT NULL,
	`latency_window` integer DEFAULT 5 NOT NULL,
	`eureka_drop_alert` integer DEFAULT true NOT NULL,
	`service_grace_seconds` integer DEFAULT 30 NOT NULL,
	`component_grace_seconds` integer DEFAULT 60 NOT NULL,
	`retention_days` integer DEFAULT 30 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`session_epoch` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`checked_at` integer DEFAULT (unixepoch()) NOT NULL,
	`overall_status` text NOT NULL,
	`response_ms` integer,
	`http_status` integer,
	`error_text` text,
	`muted` integer DEFAULT false NOT NULL,
	`raw_json` text,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checks_monitor_time_idx` ON `checks` (`monitor_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `component_statuses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`check_id` integer NOT NULL,
	`path` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	FOREIGN KEY (`check_id`) REFERENCES `checks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comp_check_path_idx` ON `component_statuses` (`check_id`,`path`);--> statement-breakpoint
CREATE TABLE `disk_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`check_id` integer NOT NULL,
	`disk_path` text,
	`total_bytes` integer,
	`free_bytes` integer,
	`used_pct` real,
	`threshold_bytes` integer,
	FOREIGN KEY (`check_id`) REFERENCES `checks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`component_path` text,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'critical' NOT NULL,
	`metric_value` real,
	`threshold` real,
	`reason` text,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ended_at` integer,
	`resolved` integer DEFAULT false NOT NULL,
	`suppressed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incidents_monitor_open_idx` ON `incidents` (`monitor_id`,`resolved`);--> statement-breakpoint
CREATE TABLE `maintenance_windows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL,
	`monitor_id` integer,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`recurrence_config` text,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `monitor_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`service_name` text NOT NULL,
	`source` text DEFAULT 'eureka' NOT NULL,
	`present` integer DEFAULT true NOT NULL,
	`tracked` integer DEFAULT true NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_services_uniq` ON `monitor_services` (`monitor_id`,`service_name`);--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`method` text DEFAULT 'GET' NOT NULL,
	`interval_seconds` integer DEFAULT 60 NOT NULL,
	`timeout_ms` integer DEFAULT 10000 NOT NULL,
	`auth_header_name` text,
	`auth_header_value` text,
	`enabled` integer DEFAULT true NOT NULL,
	`next_check_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_status` text,
	`disk_warn_pct` real,
	`disk_crit_pct` real,
	`down_for_minutes` integer,
	`latency_warn_ms` integer,
	`latency_window` integer,
	`eureka_drop_alert` integer,
	`service_grace_seconds` integer,
	`component_grace_seconds` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitors_next_check_idx` ON `monitors` (`enabled`,`next_check_at`);--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`check_id` integer NOT NULL,
	`source` text NOT NULL,
	`service_name` text NOT NULL,
	`instance_count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`check_id`) REFERENCES `checks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `svc_check_source_idx` ON `service_snapshots` (`check_id`,`source`);