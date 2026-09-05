import { Project, ProjectType, Version } from "modrinth-api-client"
import { apiClient, client } from "."
import { ApplicationEmoji, ChatInputCommandInteraction, Client, ComponentType, Interaction, InteractionCallback, MessageFlags, TextChannel, TimestampStylesString } from "discord.js";
import { RinthComponentBuilder } from "./class/ComponentBuilder";
import { getAverageColor } from "fast-average-color-node";
import config from "./constants";
import sharp from "sharp";
import { join } from "path";
import { ensureDirSync } from "fs-extra";

export type InteractionInfo = {
    command?: string;
    subcommandGroup?: string;
    subcommand?: string;
    componentType?: ComponentType;
    action: string;
    interactionId: string;
}

export const loaderColors = {
  babric: 0xFFFFFF,
  'bta-babric': 0x72CC4A,
  bukkit: 0xF6AF7B,
  bungeecord: 0xD2C080,
  canvas: 0xFFFFFF,
  datapack: 0xFFFFFF,
  fabric: 0xDBB69B,
  folia: 0xA5E388,
  forge: 0x959EEF,
  geyser: 0xFFFFFF,
  iris: 0xFFFFFF,
  'java-agent': 0xFFFFFF,
  'legacy-fabric': 0xFFFFFF,
  liteloader: 0x7AB0EE,
  minecraft: 0xFFFFFF,
  modloader: 0xFFFFFF,
  neoforge: 0xF99E6B,
  nilloader: 0xF45E9A,
  optifine: 0xFFFFFF,
  ornithe: 0x87C7FF,
  paper: 0xEEAAAA,
  quilt: 0xC796F9,
  rift: 0xFFFFFF,
  spigot: 0xF1CC84,
  sponge: 0xF9E580,
  vanilla: 0xFFFFFF,
  velocity: 0x83D5EF,
  waterfall: 0x78A4FB
};

export function createCustomId(data: InteractionInfo) {
    return `${data.command ? `${data.command}` : ""}.${data.subcommandGroup ? `${data.subcommandGroup}` : ""}.${data.subcommand ? `${data.subcommand}` : ""}.${data.componentType ? `${Object.values(ComponentType)[data.componentType - 1]}` : ""}.${data.action}#${data.interactionId}`
}

export function generateCustomId(interaction: Interaction, action: string, componentType?: ComponentType) {
    let data: InteractionInfo = {
        action,
        interactionId: interaction.id
    }

    if (componentType) data.componentType = componentType

    if (interaction.isChatInputCommand()) {
        data.command = interaction.commandName
        if (interaction.options.getSubcommandGroup(false)) data.subcommandGroup = interaction.options.getSubcommandGroup(false)
        if (interaction.options.getSubcommand(false)) data.subcommand = interaction.options.getSubcommand(false)
    }

    return createCustomId(data)
}

export function parseCustomId(id: string, failHard = true) {
    const hashSplit = id.split("#")
    if (hashSplit.length < 2) {
        if (failHard) throw new Error(`Invalid custom ID: ${id}`)
        return null;
    }

    const headerData = hashSplit[0].split(".")
    if (hashSplit.length == 0) {
        if (failHard) throw new Error(`Invalid custom ID: ${id}`)
        return null;
    }

    let data: InteractionInfo = {
        interactionId: hashSplit[1],
        action: headerData[headerData.length - 1]
    }

    if (headerData[0].length > 0) data.command = headerData[0]
    if (headerData[1].length > 0) data.subcommandGroup = headerData[1]
    if (headerData[2].length > 0) data.subcommand = headerData[2]
    if (headerData[3].length > 0) data.componentType = Object.values(ComponentType).indexOf(headerData[3]) + 1

    return data;
}

export const allProjectTypes = async (): Promise<string[]> => {
  return (await apiClient.Tags().getProjectTypes()).data || [];
}

export const reply = async (
  interaction: ChatInputCommandInteraction,
  container: RinthComponentBuilder,
  ephemeral: boolean = false,
): Promise<InteractionCallback> => {
  let r;
  if (ephemeral)
    r = await interaction.reply({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [container.buildContainer()],
      withResponse: true,
    });
  if (!ephemeral)
    r = await interaction.reply({
      flags: [MessageFlags.IsComponentsV2],
      components: [container.buildContainer()],
      withResponse: true,
    });

  return r;
};

export const avgColor = async <T extends boolean = false>(
  url: string,
  hash?: T,
): Promise<T extends true ? string : number> => {
  const ac = await getAverageColor(url);
  const str = ac.hex;
  if (hash) return str as any;
  const noHash = str.split("#")[1];
  try {
    return parseInt(`0x${noHash}`) as any;
  } catch (e) {
    return config.brand_color as any;
  }
};

export const formatTime = (time: Date | number): string => {
  let formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "long",
    timeZone: "America/New_York",
  });
  return formatter.format(time);
}

export const timestamp = (time: Date, style: TimestampStylesString): string => {
  return `<t:${Math.floor(time.getTime() / 1000)}:${style}>`
}

export const formatCompactNumber = (num: number): string => {
  const formatter = Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  });

  return formatter.format(num);
}

export const svgToPng = async (svg: string, filename: string): Promise<void> => {
  ensureDirSync(join(process.cwd(), "out", "svg"))
  await sharp(Buffer.from(svg)).png().toFile(join(process.cwd(), "out", "svg", `${filename}.png`));
}

export const appEmoji = async (emojiName: string): Promise<ApplicationEmoji | null> => {
    let ems = await client.application.emojis.fetch()
    let emoji = ems.find(e => e.name.toLowerCase() === emojiName.toLowerCase());

    return emoji || null;
}

export const sendTrackingIntro = async (loader: string, gameVersion: string, project: Project, channel: TextChannel): Promise<void> => {
  const icon = project?.icon_url || config.images.icon;
  const color = await avgColor(icon);

  const container = new RinthComponentBuilder().setAccentColor(color);
  container.addThumbnailAccessorySection(`## Tracking Enabled\nThis channel will receive updates regarding \`${project.title} [${loader} v${gameVersion}]\``, icon);

  channel.send({flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()]})
}

export const sendTrackingOutro = async (loader: string, gameVersion: string, project: Project, channel: TextChannel): Promise<void> => {
  const icon = project?.icon_url || config.images.icon;
  const color = await avgColor(icon);

  const container = new RinthComponentBuilder().setAccentColor(color);
  container.addThumbnailAccessorySection(`## Tracking Disabled\nThis channel will no longer receive updates regarding \`${project.title} [${loader} v${gameVersion}]\``, icon);

  if(channel) channel.send({flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()]})
}

export const getLatestProjectVersion = async (id: string, gameVersion: string, loader: string): Promise<Version | null> => {
  const res = await apiClient.Versions().listProjectVersions(id);
  if (!res.data) return null;
  const versions = res.data.filter(v => v.game_versions.includes(gameVersion) && v.loaders.includes(loader)).sort((a, b) => new Date(b.date_published).getTime() - new Date(a.date_published).getTime());

  return versions?.[0] || null;
}
