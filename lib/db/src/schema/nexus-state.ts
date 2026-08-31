import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const nexusStateTable = pgTable("nexus_state", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertNexusStateSchema = createInsertSchema(nexusStateTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertNexusState = z.infer<typeof insertNexusStateSchema>;
export type NexusStateRow = typeof nexusStateTable.$inferSelect;