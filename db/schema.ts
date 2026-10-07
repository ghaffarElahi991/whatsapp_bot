import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    fileName: text("file_name").notNull(),
    status: text("status").notNull().default("draft"),
    mode: text("mode").notNull().default("demo"),
    templateName: text("template_name").notNull(),
    templateLanguage: text("template_language").notNull(),
    totalContacts: integer("total_contacts").notNull().default(0),
    validContacts: integer("valid_contacts").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_campaigns_created_at").on(table.createdAt)],
);

export const campaignContacts = sqliteTable(
  "campaign_contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: text("client_id").notNull(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    name: text("name").notNull().default(""),
    originalNumber: text("original_number").notNull(),
    normalizedNumber: text("normalized_number"),
    countryCode: text("country_code"),
    country: text("country"),
    validationStatus: text("validation_status").notNull(),
    validationDetail: text("validation_detail").notNull().default(""),
    whatsappStatus: text("whatsapp_status").notNull().default("not_checked"),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    messageId: text("message_id"),
    processedAt: text("processed_at"),
  },
  (table) => [
    index("idx_campaign_contacts_campaign_status").on(
      table.campaignId,
      table.whatsappStatus,
    ),
    uniqueIndex("idx_campaign_contacts_message_id").on(table.messageId),
  ],
);
