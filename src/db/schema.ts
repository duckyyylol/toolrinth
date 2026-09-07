import { randomUUID } from "crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const guilds = sqliteTable("guilds", {
  id: text("id").notNull().primaryKey(),
  authorized: integer("authorized", { mode: "boolean" }).notNull().default(false),
  authorized_user_id: text("authorized_user_id"),
  token: text("token")
});

export const tracked_projects = sqliteTable("tracked_projects", {
  id: text("id").notNull().primaryKey().$defaultFn(() => randomUUID()),
  guild_id: text("guild_id").notNull(),
  channel_id: text("channel_id").notNull(),
  project_id: text("project_id").notNull(),
  game_version: text("game_version").notNull(),
  loader: text("loader").notNull(),
  last_update: integer("last_update").notNull(),
  last_version: text("last_version").notNull(),
});
