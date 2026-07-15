ALTER TABLE `monitors` ADD `auth_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitors` ADD `auth_username` text;
--> statement-breakpoint
UPDATE `monitors` SET `auth_type` = 'header' WHERE `auth_header_name` IS NOT NULL AND `auth_header_name` != '';
