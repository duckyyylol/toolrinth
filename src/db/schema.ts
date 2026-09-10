import { UserNotificationTypes } from "@toolrinth/lib";
import { randomUUID } from "crypto";
import { integer, pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const notification_types: string[] = Object.values(UserNotificationTypes);
export const notification_types_readable: Record<string, string> = {
  [UserNotificationTypes.MODERATOR_MESSAGE]: "Moderator Messages",
  [UserNotificationTypes.PROJECT_UPDATE]: "Project Updates",
  [UserNotificationTypes.STATUS_CHANGE]: "Status Changes",
  [UserNotificationTypes.TEAM_INVITE]: "Team Invites",
}

export const contexts = pgTable("contexts", {
  id: text("id").notNull().primaryKey(),
  type: text("type").notNull().default("guild"),
  authorized: boolean("authorized").notNull().default(false),
  authorized_user_id: text("authorized_user_id"),
  authorization_expired: boolean("authorization_expired").notNull().default(false),
  authorization_expires_at: timestamp("authorization_expires_at", {withTimezone: true}),
  authorization_notification_sent: boolean("authorization_notification_sent").notNull().default(false),
  token: text("token"),
  default_tracking_channel: text("default_tracking_channel"),
  last_feed_fetched: timestamp("last_feed_fetched", {withTimezone: true}).notNull().$defaultFn(() => new Date())
});

export const tracked_projects = pgTable("tracked_projects", {
  id: text("id").notNull().primaryKey().$defaultFn(() => randomUUID()),
  context_id: text("context_id").notNull(),
  channel_id: text("channel_id").notNull(),
  project_id: text("project_id").notNull(),
  game_version: text("game_version").notNull(),
  loader: text("loader").notNull(),
  last_update: timestamp("last_update", {withTimezone: true}).notNull(),
  last_version: text("last_version").notNull(),
});

export const notification_relays = pgTable("notification_relays", {
  user_id: text("user_id").notNull().primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  notified_ids: text("notified_ids").array().notNull().default([]),
  last_notified: timestamp("last_notified", {withTimezone: true}).notNull().$defaultFn(() => new Date()),
  last_updated: timestamp("last_updated", {withTimezone: true}).notNull().$defaultFn(() => new Date()),
  consecutive_failures: integer("consecutive_failures").notNull().default(0),
  next_poll_at: timestamp("next_poll_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  excluded_types: text("excluded_types").notNull().array().default([])
})
