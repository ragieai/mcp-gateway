import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  organizationId: text("organization_id").notNull(),
  partition: text("partition").notNull(),
  allowedRoles: jsonb("allowed_roles").notNull().$type<string[] | "*">(),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  ragieApiKey: text("ragie_api_key").notNull(), // Encrypted API key for Ragie
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
