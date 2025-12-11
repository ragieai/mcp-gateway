import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const collections = pgTable("collections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	organizationId: text("organization_id").notNull(),
	partition: text().notNull(),
	mcpServerUrl: text("mcp_server_url").notNull(),
	allowedRoles: jsonb("allowed_roles").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	filters: jsonb(),
});
