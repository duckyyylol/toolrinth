import { and, eq } from "drizzle-orm";
import { db } from ".";
import { guilds, tracked_projects } from "./schema";
import { logger } from "..";

export namespace DB {
  export namespace Guilds {
    export const createGuild = (data: typeof guilds.$inferInsert): typeof guilds.$inferInsert => {
      logger.info(`Created DB entry for guild ${data.id}`)
      return db.insert(guilds).values(data).returning().get();
    }

    export const getGuild = (id: string): typeof guilds.$inferInsert | null => {
      logger.info(`Fetched DB entry for guild ${id}`)
      return db.select().from(guilds).where(eq(guilds.id, id)).get() || null;
    }

    export const deleteGuild = (id: string): typeof guilds.$inferInsert => {
      logger.info(`Deleted DB entry for guild ${id}`)
      return db.delete(guilds).where(eq(guilds.id, id)).returning().get();
    }

    export const createTrackedProject = (data: typeof tracked_projects.$inferInsert): typeof tracked_projects.$inferInsert => {
      return db.insert(tracked_projects).values(data).returning().get();
    }

    export const getAllTrackedProjects = (): typeof tracked_projects.$inferInsert[] => {
      return db.select().from(tracked_projects).all() || [];
    }

    export const updateTrackedProject = (project_id: string, guild_id: string, changes: typeof tracked_projects.$inferInsert): typeof tracked_projects.$inferInsert => {
      return db.update(tracked_projects).set(changes).where(and(eq(tracked_projects.project_id, project_id), eq(tracked_projects.guild_id, guild_id))).returning().get();
    }

    export const deleteTrackedProject = (project_id: string, guild_id: string): typeof tracked_projects.$inferInsert => {
      return db.delete(tracked_projects).where(and(eq(tracked_projects.project_id, project_id), eq(tracked_projects.guild_id, guild_id))).returning().get();
    }
  }
}
