import { and, asc, eq, lte } from "drizzle-orm";
import { db } from ".";
import { contexts, notification_relays, tracked_projects } from "./schema";
import { dev_mode, logger } from "..";
import { ContextTypes } from "../types";
import { getFirst } from "../util";

export namespace DB {
  export namespace Contexts {
    export const createContext = async (data: typeof contexts.$inferInsert): Promise<typeof contexts.$inferInsert> => {
      logger.info(`Created DB entry for context ${data.id}`)
      return getFirst(await db.insert(contexts).values(data).returning());
    }

    export const getAllContexts = async (type?: ContextTypes, limit?: number): Promise<(typeof contexts.$inferInsert)[]> => {
      let arr = limit ? await db.select().from(contexts).limit(limit) : await db.select().from(contexts);
      if (type) arr = arr.filter(v => v.type === type);
      return arr;
    }

    export const getContext = async (id: string): Promise<typeof contexts.$inferInsert | null> => {
      logger.info(`Fetched DB entry for context ${id}`)
      return getFirst(await db.select().from(contexts).where(eq(contexts.id, id)));
    }

    export const deleteContext = async (id: string): Promise<typeof contexts.$inferInsert> => {
      logger.info(`Deleted DB entry for context ${id}`)
      return getFirst(await db.delete(contexts).where(eq(contexts.id, id)).returning());
    }

    export const createTrackedProject = async (data: typeof tracked_projects.$inferInsert): Promise<typeof tracked_projects.$inferInsert> => {
      return getFirst(await db.insert(tracked_projects).values(data).returning());
    }

    export const getAllTrackedProjects = async (): Promise<typeof tracked_projects.$inferInsert[]> => {
      return await db.select().from(tracked_projects);
    }

    export const updateTrackedProject = async (project_id: string, context_id: string, changes: typeof tracked_projects.$inferInsert): Promise<typeof tracked_projects.$inferInsert> => {
      return getFirst(await db.update(tracked_projects).set(changes).where(and(eq(tracked_projects.project_id, project_id), eq(tracked_projects.context_id, context_id))).returning());
    }

    export const deleteTrackedProject = async (project_id: string, context_id: string): Promise<typeof tracked_projects.$inferInsert> => {
      return getFirst(await db.delete(tracked_projects).where(and(eq(tracked_projects.project_id, project_id), eq(tracked_projects.context_id, context_id))).returning());
    }

    export const setValue = async (id: string, data: Partial<typeof contexts.$inferInsert>): Promise<typeof contexts.$inferInsert> => {
      logger.info(`Updated values for context ${id}`, data)
      return getFirst(await db.update(contexts).set(data).where(eq(contexts.id, id)).returning())
  }
  }
  export namespace Auth {
    export const updateAuth = async (contextId: string, userId: string, token: string, expiresInSeconds: number): Promise<typeof contexts.$inferInsert> => {
      let context = await Contexts.getContext(contextId);
      if (!context) return await Contexts.createContext({ id: contextId, authorized: true, authorized_user_id: userId, token });
      return getFirst(await db.update(contexts).set({ authorized: true, authorized_user_id: userId, token, authorization_expired: false, authorization_notification_sent: false, authorization_expires_at: new Date(Date.now() + (expiresInSeconds*1000)) }).where(eq(contexts.id, context.id)).returning());
    }

    export const getToken = async (contextId: string): Promise<string | null> => {
      let context = await Contexts.getContext(contextId);
      if (!context || !context.token) return null;
      return context.token;
    }

    export const removeAuth = async (contextId: string): Promise<typeof contexts.$inferInsert> => {
      let context = await Contexts.getContext(contextId);
      if (!context) return await Contexts.createContext({ id: contextId, authorized: false });
      return getFirst(await db.update(contexts).set({ authorized: false, authorized_user_id: null, token: null, authorization_expires_at: null }).where(eq(contexts.id, context.id)).returning());
    }
  }

  export namespace Relays {
    export const INTERVAL_MS = process.argv.includes("-dev") ? (30e3) : (5 * 60e3);
    export const ensureRelay = async (userId: string): Promise<typeof notification_relays.$inferInsert> => {
      let relay = getFirst(await db.select().from(notification_relays).where(eq(notification_relays.user_id, userId)));

      return relay || getFirst(await db.insert(notification_relays).values({ user_id: userId, last_notified: new Date(), enabled: false, notified_ids: [], consecutive_failures: 0, next_poll_at: new Date() }).returning());
    }

    export const updateRelay = async (userId: string, data: Partial<typeof notification_relays.$inferInsert>): Promise<typeof notification_relays.$inferInsert> => {
      await ensureRelay(userId);
      return getFirst(await db.update(notification_relays).set(data).where(eq(notification_relays.user_id, userId)).returning());
    }

    export const toggleRelay = async (userId: string): Promise<typeof notification_relays.$inferInsert> => {
      let relay = await ensureRelay(userId);
      let enabled = !relay.enabled;
      return await updateRelay(userId, { enabled, consecutive_failures: enabled ? 0 : relay.consecutive_failures, next_poll_at: enabled ? new Date() : relay.next_poll_at });
    }

    export const markNotified = async (userId: string, newIds: string[], max: number = 50, resetFailures: boolean = false) => {
      let relay = await ensureRelay(userId);

      let ids = [...(new Set([...relay.notified_ids, ...newIds]))];
      if (ids.length > max) ids = ids.slice(-max);

      let nextPoll = new Date(Date.now() + INTERVAL_MS)

      return getFirst(await db.update(notification_relays).set({ notified_ids: ids, last_updated: new Date(), last_notified: new Date(), consecutive_failures: resetFailures ? 0 : relay.consecutive_failures, next_poll_at: nextPoll }).where(eq(notification_relays.user_id, userId)).returning());
    }

    export const getDueRelays = async (limit: number = 50): Promise<(typeof notification_relays.$inferInsert)[]> => {
      return await db.select().from(notification_relays).where(and(eq(notification_relays.enabled, true), lte(notification_relays.next_poll_at, new Date()))).limit(limit).orderBy(asc(notification_relays.next_poll_at));
    }

    export const recordFailure = async (userId: string, threshold: number = 10): Promise<typeof notification_relays.$inferInsert> => {
      let relay = await ensureRelay(userId);

      let failures = relay.consecutive_failures + 1;
      let enabled = relay.enabled;

      if (failures >= threshold) enabled = false;

      let backoff = new Date(Date.now() + (INTERVAL_MS * Math.pow(2, failures)));

      return getFirst(await db.update(notification_relays).set({ enabled, consecutive_failures: failures, next_poll_at: backoff }).where(eq(notification_relays.user_id, userId)).returning());
    }

    export const recordSuccess = async (userId: string, nextInterval: number = INTERVAL_MS): Promise<typeof notification_relays.$inferInsert> => {
      await ensureRelay(userId);

      let nextPoll = new Date(Date.now() + nextInterval);

      return getFirst(await db.update(notification_relays).set({ consecutive_failures: 0, next_poll_at: nextPoll }).where(eq(notification_relays.user_id, userId)).returning());
    }

    export const updateLastNotified = async (userId: string, newIds: string[]): Promise<typeof notification_relays.$inferInsert> => {
      return await markNotified(userId, newIds, 50, true);
    }

  }
}
