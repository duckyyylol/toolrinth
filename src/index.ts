import {
  ApplicationCommandData,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { configDotenv } from "dotenv";
import { readdirSync } from "fs";
import { ApiClient, Project, TeamMember, Version } from "@toolrinth/lib";
import { join } from "path";
import { Command } from "./class/Command";
import Logger from "./class/Logger";
import { avgColor, getLatestProjectVersion, svgToPng, timestamp } from "./util";
import { DB } from "./db/DB";
import { RinthComponentBuilder } from "./class/ComponentBuilder";
import config from "./constants";
import { tracked_projects } from "./db/schema";
import * as webserver from "./webserver"

configDotenv({ path: join(process.cwd(), ".env"), quiet: true });

export const client = new Client({ intents: [] });
export const apiClient = new ApiClient();

const apiClients: Map<string, ApiClient> = new Map();

export const dev_mode = process.argv.includes("-dev");
export const desiredExt = dev_mode ? ".ts" : ".js";
export const globalCommandMap: Map<string, Command> = new Map();

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

export function setApiClient(guildId: string, token: string | null = null): ApiClient {
  const ac = new ApiClient(token);
  apiClients.set(guildId, ac);
  logger.info(`Updated API client for guild ${guildId}${token ? " [with a token]" : ""}`)
  return ac;
}

export function getApiClient(guildId?: string): ApiClient {
  if (!guildId || !apiClients.has(guildId)) return new ApiClient();
  return apiClients.get(guildId);
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
      DB.Guilds.updateTrackedProject(
        project.project_id,
        project.guild_id,
        {
          channel_id: project.channel_id,
          game_version: project.game_version,
          guild_id: project.guild_id,
          last_update: Date.now(),
          last_version: latestVersion.id,
          loader: project.loader,
          project_id: project.project_id,
        },
      );
    })
    .catch(() => {});
}

async function updateTrackedProjects() {
  const projects = DB.Guilds.getAllTrackedProjects();

  for (const project of projects) {
    const guild = await client.guilds.fetch(project.guild_id);
    const channel = await guild.channels.fetch(project.channel_id) as TextChannel;

    const latestVersion = await getLatestProjectVersion(
      project.project_id,
      project.game_version,
      project.loader,
    );
    if (latestVersion && latestVersion.id !== project.last_version) {
      if (project.last_update < Date.now()) {
        let res = await apiClient.Projects().getProject(project.project_id);
        if (res.data) {
          const pr = res.data;

          await sendTrackedProjectUpdate(pr, project, channel, latestVersion)
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

client.on(Events.ClientReady, async () => {
  await loadEvents(client);
  await loadCommands(client);
  await trackedProjectHandler();
  webserver.start();

  for (const guild of client.guilds.cache.values()) {
    let dbGuild = DB.Guilds.getGuild(guild.id);
    if (!dbGuild) dbGuild = DB.Guilds.createGuild({ id: guild.id });

    if (dbGuild.token) {
      setApiClient(dbGuild.id, dbGuild.token);
    } else setApiClient(dbGuild.id)
  }
});

client.login(process.env.TOKEN);
