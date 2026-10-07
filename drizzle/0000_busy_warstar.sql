CREATE TABLE `campaign_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`original_number` text NOT NULL,
	`normalized_number` text,
	`country_code` text,
	`country` text,
	`validation_status` text NOT NULL,
	`validation_detail` text DEFAULT '' NOT NULL,
	`whatsapp_status` text DEFAULT 'not_checked' NOT NULL,
	`error_code` text,
	`error_detail` text,
	`message_id` text,
	`processed_at` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_contacts_campaign_status` ON `campaign_contacts` (`campaign_id`,`whatsapp_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_campaign_contacts_message_id` ON `campaign_contacts` (`message_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`mode` text DEFAULT 'demo' NOT NULL,
	`template_name` text NOT NULL,
	`template_language` text NOT NULL,
	`total_contacts` integer DEFAULT 0 NOT NULL,
	`valid_contacts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaigns_created_at` ON `campaigns` (`created_at`);--> statement-breakpoint
PRAGMA optimize;
