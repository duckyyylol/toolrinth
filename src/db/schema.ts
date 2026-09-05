import { randomUUID } from "crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const guilds = sqliteTable("guilds", {
  id: text("id").notNull().primaryKey(),
});

export const tracked_projects = sqliteTable("tracked_projects", {
  id: text("id").notNull().primaryKey().$defaultFn(() => randomUUID()),
  guild_id: text("guild_id").notNull().references(() => guilds.id),
  channel_id: text("channel_id").notNull(),
  project_id: text("project_id").notNull(),
  game_version: text("game_version").notNull(),
  loader: text("loader").notNull(),
  last_update: integer("last_update").notNull(),
  last_version: text("last_version").notNull(),
});
