import "dotenv/config"
import { configDotenv } from "dotenv";
import {
  ApplicationCommandData,
  ApplicationEmoji,
  blockQuote,
  ButtonStyle,
  Client,
  ContainerBuilder,
  Events,
  GatewayIntentBits,
  Guild,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { readdirSync } from "fs";
import { ApiClient, OAuth2, Project, User, UserNotification, UserNotificationTypes, Version } from "@toolrinth/lib";
import { join } from "path";
import { Command } from "./class/Command";
import Logger from "./class/Logger";
import { appEmoji, avgColor, createCustomId, getLatestProjectVersion, parseCustomId, timestamp } from "./util";
import { DB } from "./db/DB";
import { RinthComponentBuilder } from "./class/ComponentBuilder";
import { contexts, notification_relays, notification_types_readable, tracked_projects } from "./db/schema";
import * as webserver from "./webserver"
import { ContextTypes, RinthEvents } from "./types";
import config from "./constants";
import EventEmitter from "events";
import { randomUUID } from "crypto";
import { getLoginContainer } from "./command/settings";

configDotenv({ path: join(process.cwd(), ".env"), quiet: true });

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });
export const apiClient = new ApiClient();
export const oauth = new OAuth2.Client(process.env.TOOLRINTH_CLIENT_ID, process.env.TOOLRINTH_CLIENT_SECRET, process.env.AUTH_URL, [OAuth2.Scopes.USER_READ, OAuth2.Scopes.NOTIFICATION_READ, OAuth2.Scopes.THREAD_READ, OAuth2.Scopes.PROJECT_READ, OAuth2.Scopes.REPORT_READ])

const apiClients: Map<string, ApiClient> = new Map();

export const mockNotifications: Map<string, UserNotification[]> = new Map();

export const dev_mode = process.argv.includes("-dev");
export const desiredExt = dev_mode ? ".ts" : ".js";
export const globalCommandMap: Map<string, Command> = new Map();
export const applicationEmojis: Map<string, ApplicationEmoji> = new Map();
export const emitter = new EventEmitter();

export const logger = new Logger();

async function loadEvents(c: Client) {
  let loaded = 0;
  const files = readdirSync(join(__dirname, "event"));
  files
    .filter((f) => f.endsWith(desiredExt))
    .forEach((file) => {
      const event = require(join(__dirname, "event", file)).default;
      const eventName = file.split(desiredExt)[0];
      if (!event)
        return logger.error(
          `Didn't load event file ${file} because it's not formatted correctly.`,
        );
      if (!event.enabled)
        return logger.error(
          `Didn't load event file ${file} because it's disabled`,
        );
      if (!event.run)
        return logger.error(
          `Didn't load event file ${file} because it has no run method`,
        );

      c.on(eventName, (...args) => event.run(...args));
      logger.info(`Loading event ${eventName}`);
      loaded += 1;
    });

  logger.success(
    `Successfully loaded ${loaded} event${loaded === 1 ? "" : "s"}`,
  );
}

async function loadCommands(c: Client) {
  const filesPath = join(
    process.cwd(),
    `${dev_mode ? "src" : "dist/src"}`,
    "command",
  );
  logger.info(`Checking commands dir: ${filesPath}`);
  const files = readdirSync(filesPath);
  let cmds: ApplicationCommandData[] = [];
  files
    .filter((f) => f.endsWith(desiredExt))
    .forEach((file) => {
      const cmd: Command = require(join(filesPath, file)).default;
      if (!cmd || !cmd.name)
        return logger.error(
          `Didn't load command file ${file} because it's not formatted correctly.`,
        );
      if (!cmd.enabled)
        return logger.error(
          `Didn't load command file ${file} because it's disabled`,
        );
      if (!cmd.run)
        return logger.error(
          `Didn't load command file ${file} because it has no run method`,
        );

      const cmdData = (({ enabled, run, helpDescription, ...o }) => o)(cmd);
      cmds.push(cmdData);
      globalCommandMap.set(cmd.name, cmd);
      logger.info(`Loading command ${file}`);
    });

  c.application?.commands
    .set(cmds)
    .then(() => {
      logger.success(
        `Successfully loaded ${cmds.length} command${cmds.length === 1 ? "" : "s"}`,
      );
    })
    .catch((e) => {
      logger.error(`Failed to load commands`);
    });
}

export function setApiClient(contextId: string, token: string | null = null): ApiClient {
  const ac = new ApiClient(token);
  apiClients.set(contextId, ac);
  logger.info(`Updated API client for context ${contextId}${token ? " [with a token]" : ""}`)
  return ac;
}

export function getApiClient(contextId?: string): ApiClient {
  if (!contextId || !apiClients.has(contextId)) return new ApiClient();
  return apiClients.get(contextId);
}

export async function sendTrackedProjectUpdate(pr: Project, project: typeof tracked_projects.$inferInsert, channel: TextChannel, latestVersion: Version, initial: boolean = false) {
  const icon = pr?.icon_url || config.images.icon;
  const color = await avgColor(icon);

  const container = new RinthComponentBuilder().setAccentColor(color);
  container.addThumbnailAccessorySection(`## ${pr.title} ${initial ? "Version Synced" : "Updated"}\n-# New version for \`${project.loader} v${project.game_version}\`\n\n-# **Version**: \`${latestVersion.version_number}\``, icon)
  container.addSeparator().addTextDisplay(`- **Version URL**: https://modrinth.com/${pr.project_type}/${pr.id}/version/${latestVersion.version_number}\n- **Download URL**: ${latestVersion.files[0].url}${latestVersion.changelog_url ? `\n- **Changelog URL**: ${latestVersion.changelog_url}` : ""}`)
  if (latestVersion.changelog) container.addSeparator().addTextDisplay(`### Changelog\n${latestVersion.changelog}`)

  container.addSeparator().addTextDisplay(timestamp(new Date(), "R"))

  if(channel) channel
    .send({
      flags: [MessageFlags.IsComponentsV2],
      components: [container.buildContainer()],
    })
    .then(() => {
      DB.Contexts.updateTrackedProject(
        project.project_id,
        project.context_id,
        {
          channel_id: project.channel_id,
          game_version: project.game_version,
          context_id: project.context_id,
          last_update: new Date(),
          last_version: latestVersion.id,
          loader: project.loader,
          project_id: project.project_id,
        },
      );
    })
    .catch(() => {});
}

async function updateTrackedProjects() {
  const projects = await DB.Contexts.getAllTrackedProjects();

  for (const project of projects) {
    const context = await DB.Contexts.getContext(project.context_id);

    if (context.type === ContextTypes.GUILD) {
      const guild = await client.guilds.fetch(project.context_id);
      const channel = await guild.channels.fetch(project.channel_id) as TextChannel;

      const latestVersion = await getLatestProjectVersion(
        project.project_id,
        project.game_version,
        project.loader,
      );
      if (latestVersion && latestVersion.id !== project.last_version) {
        if (project.last_update.getTime() < Date.now()) {
          let res = await apiClient.Projects().getProject(project.project_id);
          if (res.data) {
            const pr = res.data;

            await sendTrackedProjectUpdate(pr, project, channel, latestVersion)
          }
        }
      }
    }
  }
}

async function trackedProjectHandler() {
  await updateTrackedProjects();

  setInterval(async () => {
    await updateTrackedProjects();
  }, 60e3);
}

async function processNotificationRelay(relay: typeof notification_relays.$inferInsert) {
  try {
    logger.info(`Processing relay for user ${relay.user_id}`)

    const api = getApiClient(relay.user_id);
    const dbContext = await DB.Contexts.getContext(relay.user_id) || await DB.Contexts.createContext({id: relay.user_id})

    const tokenUserRes = dbContext.token ? await oauth.getUserFromToken(dbContext.token) : {error: {message: "Unauthorized"}};

    if (tokenUserRes.error) {
      // user's auth expired
      logger.error(`Error fetching authorized user in relay loop: ${tokenUserRes.error.message}`)
      return;
    } else {
      await DB.Contexts.setValue(relay.user_id, { authorization_expired: false, authorized: true, authorization_notification_sent: false });
    }

    const tokenUser = tokenUserRes.data;

    const res = dev_mode && mockNotifications.has(relay.user_id) ? { data: mockNotifications.get(relay.user_id), error: null } : await api.Users().getUserNotifications(tokenUser.id);

    if (res.error || !res.data) throw new Error("The Modrinth API returned an error: " + res.error?.message)

    const notifications = res.data;

    const newNotifs = notifications.filter(n => {
      const alreadyNotified = relay.notified_ids.includes(n.id);
      const old = process.argv.includes("-dev") ? false : new Date(n.created).getTime() <= new Date(relay.last_notified).getTime();

      return !alreadyNotified && !old && !relay.excluded_types.includes(n.type ?? "project_update");
    }).sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()).sort((a, b) => a.type.localeCompare(b.type));

    if (newNotifs.length === 0) {
      await DB.Relays.recordSuccess(relay.user_id);
      return;
    }

    const user = await client.users.fetch(relay.user_id);

    const toSend = newNotifs.slice(0, 24);

    const MAX_TEXT_LENGTH = 120;
    const MAX_TITLE_LENGTH = 40;
    const INLINE_TITLE_LENGTH = 30;
    const MAX_NOTIFS = 5;

    const containers: ContainerBuilder[] = [];

    for (let i = 0; i < toSend.length; i += MAX_NOTIFS) {
      const batch = toSend.slice(i, i + MAX_NOTIFS);
      const container = new RinthComponentBuilder().setAccentColor(config.brand_color);

      if (i === 0) {
        container.addTextDisplay(`## ${toSend.length} New Modrinth Notification${toSend.length === 1 ? "" : "s"}\n-# [View your notifications on Modrinth.com](<https://modrinth.com/dashboard/notifications>)`).addSeparator()
      }

      for (const notif of batch) {
        let title = notif.title.length > MAX_TITLE_LENGTH ? notif.title.slice(0, MAX_TITLE_LENGTH) + "..." : notif.title;
        let body = notif.text.length > MAX_TEXT_LENGTH ? notif.text.slice(0, MAX_TEXT_LENGTH) + "..." : notif.text;

        if (body.includes("to Rejected")) title = `Project status changed to ${await appEmoji("status_rejected")} __Rejected__`;
        if (body.includes("to Under Review")) title = `Project status changed to ${await appEmoji("status_processing")} __Under Review__`;
        if (body.includes("to Listed")) title = `Project status changed to ${await appEmoji("status_approved")} __Public__`;
        if (body.includes("to Unlisted")) title = `Project status changed to ${await appEmoji("status_unlisted")} __Unlisted__`;
        if (body.includes("to Private")) title = `Project status changed to ${await appEmoji("status_private")} __Private__`;

        if (body.startsWith("The project ")) {
          let split = body.split("The project ")[1].split(" ").slice(0, 1);
          let pId = split[0].trim();

          let project: Project | null = null;
            const projectRes = await getApiClient(relay.user_id).Projects().getProject(pId);
            if (projectRes.data) {
              project = projectRes.data;
            }

          if(project) body = body.replaceAll(pId, `**${project.title.length > INLINE_TITLE_LENGTH ? project.title.slice(0, INLINE_TITLE_LENGTH) + "..." : project.title}**`)
        }

        if (body.includes("a new version: ")) {
          let vId = body.split("a new version: ")[1].split(" ")[0].trim();
          const versionRes = await getApiClient(relay.user_id).Versions().getVersionById(vId);
          let version: Version | null = null;
          if (versionRes.data) {
            version = versionRes.data;
          }

          if(version) body = body.replaceAll(vId, `[**${(version.version_number || version.name).length > INLINE_TITLE_LENGTH ? (version.version_number || version.name).slice(0, INLINE_TITLE_LENGTH) + "..." : (version.version_number || version.name)}**](${version.files[0].url})`)
        }

        const isLinkStyle = notif.type === UserNotificationTypes.MODERATOR_MESSAGE;

        if (!isLinkStyle) {
          container.addButtonAccessorySection(`### ${title}\n-# ${await appEmoji(`message_${notif.type}`)} \`${notification_types_readable[notif.type]}\` ⋅ ${timestamp(new Date(notif.created), "R")}\n${blockQuote(body)}`,
            isLinkStyle ? ButtonStyle.Link : ButtonStyle.Primary,
            `${isLinkStyle ? "Read More" : "View"}`,
            parseCustomId(createCustomId({ interactionId: randomUUID(), action: "view-notif", command: notif.id }))
          );
        } else {
          let project: Project | null = null;
          if (notif.link.startsWith("/project")) {
            let pId = notif.link.split("/")[2].trim();
            const projectRes = await getApiClient(relay.user_id).Projects().getProject(pId);
            if (projectRes.data) {
              project = projectRes.data;
            }
          }
          const projectTitle = project ? project.title.length > INLINE_TITLE_LENGTH ? project.title.slice(0, INLINE_TITLE_LENGTH) + "..." : project.title : null;
          container.addLinkButtonAccessorySection(`### ${title}\n-# ${await appEmoji(`message_${notif.type}`)} \`${notification_types_readable[notif.type]}\`${project ? ` ⋅ **${projectTitle}**` : ""} ⋅ ${timestamp(new Date(notif.created), "R")}\n${blockQuote(body)}`,
            `${isLinkStyle ? "Read More" : "View"}`,
            `https://modrinth.com${notif.link}/moderation#messages`
          );
        }
      }

      if (toSend.length < MAX_NOTIFS || (i + MAX_NOTIFS) >= toSend.length) {
        container.addSeparator().addTextDisplay(`-# ${timestamp(new Date(), "R")}`);
      } else {
        container.addSeparator();
      }

      containers.push(container.buildContainer());
    }

    for (const container of containers) {
      await user.send({flags: [MessageFlags.IsComponentsV2], components: [container]})
    }

    await DB.Relays.markNotified(relay.user_id, toSend.map(n => n.id));
    await DB.Relays.updateRelay(relay.user_id, {last_notified: new Date(toSend[toSend.length-1].created)})
    await DB.Relays.recordSuccess(relay.user_id);
  } catch (e) {
    await DB.Relays.recordFailure(relay.user_id);
    logger.error(`Relay processing failed for ${relay.user_id}: ${e}`)
  }
}

export async function notificationRelayTick() {
  const relays = await DB.Relays.getDueRelays(50);

  if (relays.length === 0) return;

  const perChunk = 20;
  const chunks: typeof relays[] = [];

  for (let i = 0; i < relays.length; i += perChunk) {
    chunks.push(relays.slice(i, i + perChunk));
  }

  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(r => processNotificationRelay(r)));
  }
}

export async function processAuthNotification(context: typeof contexts.$inferInsert) {
  let in24Hours = Date.now() + (24 * (60 * 60e3));
  if (context.authorization_expires_at.getTime() <= Date.now()) {

  } else if (context.authorization_expires_at.getTime() <= in24Hours && !context.authorization_notification_sent) {
      await DB.Contexts.setValue(context.id, { authorization_notification_sent: true });
    try {
      const user = await client.users.fetch(context.authorized_user_id);

      const guild = client.guilds.cache.get(context.id);

      const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
      container.addTextDisplay(`### Your Modrinth authentication${guild ? ` for **${guild.name}**` : ""} expires ${timestamp(context.authorization_expires_at, "R")}`)


      user.send({flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer(), RinthComponentBuilder.textDisplay(`-# Refresh the authentication and avoid disruptions by logging in again`), getLoginContainer(context.id, user.id).buildContainer()]})

    } catch (e) {
      console.log(e);
      logger.error(`Failed to notify context ${context.id} (user ${context.authorized_user_id}) of authorization expiration (24 hours)`)
    }
  }
}

export async function authNotificationTick() {
  const authed = (await DB.Contexts.getAllContexts(null, 50)).filter(c => c.authorized);

  if (authed.length === 0) return;

  const perChunk = 20;
  const chunks: typeof authed[] = [];

  for (let i = 0; i < authed.length; i += perChunk) {
    chunks.push(authed.slice(i, i + perChunk));
  }

  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(c => processAuthNotification(c)));
  }
}

async function notificationRelayHandler() {
  await notificationRelayTick();

  setInterval(async () => {
    await notificationRelayTick();
  }, 30e3);
}

async function authNotificationHandler() {
  await authNotificationTick();

  setInterval(async () => {
    await authNotificationTick();
  }, 30e3);
}

async function emojiCacheHandler() {
  const emojis = await client.application.emojis.fetch();

  for (const e of emojis) {
    applicationEmojis.set(e[0].toLowerCase(), e[1]);
  }
}

client.on(Events.ClientReady, async () => {
  await loadEvents(client);
  await loadCommands(client);
  await trackedProjectHandler();
  await notificationRelayHandler();
  await authNotificationHandler();
  await emojiCacheHandler();

  webserver.start();

  if (client.application.description !== config.bio) {
    await client.application.edit({ description: config.bio });
  }

  for (const guild of client.guilds.cache.values()) {
    let dbGuild = await DB.Contexts.getContext(guild.id);
    if (!dbGuild) dbGuild = await DB.Contexts.createContext({ id: guild.id, type: ContextTypes.GUILD });
  }

  for (const context of await DB.Contexts.getAllContexts()) {
    if (context.token) {
      setApiClient(context.id, context.token);
    } else setApiClient(context.id)
  }
});

emitter.on(RinthEvents.USER_AUTHORIZE, async (contextId: string, userId: string, tokenUser: User) => {
  logger.info(`Authorized context ${contextId} [User: ${userId}]`);

  const dbContext = await DB.Contexts.getContext(contextId);

  if(dbContext.token) setApiClient(contextId, dbContext.token)

  const user = await client.users.fetch(userId);
  let contextGuild: Guild | null = client.guilds.cache.get(contextId) || null;

  try {
    const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
    container.addThumbnailAccessorySection(`## Modrinth Authorized\n-# ${tokenUser.username} (${tokenUser.id})${contextGuild ? `\n- **Guild**: ${contextGuild.name}` : ""}\n\n**Authorization Expires:** ${timestamp(dbContext.authorization_expires_at, "R")}`, tokenUser.avatar_url)

    user.send({flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()]})
  } catch (e) {

  }
});

client.login(dev_mode ? process.env.TOKEN_DEV : process.env.TOKEN);
