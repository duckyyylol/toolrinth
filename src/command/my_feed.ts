import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  inlineCode,
  InteractionContextType,
  MessageFlags,
  userMention,
} from "discord.js";
import { apiClient, getApiClient } from "..";
import { Command } from "../class/Command";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import { DB } from "../db/DB";
import {
  appEmoji,
  formatCompactNumber,
  generateCustomId,
  getContext,
  parseCustomId,
  timestamp,
} from "../util";
import { getLoginContainer } from "./settings";
import { Project, Version, ProjectStatus, ProjectTypes } from "@toolrinth/lib";
import config from "../constants";
import { projectTypesReadable } from "../types";

const MyFeedCommand: Command = {
  enabled: true,
  name: "my_feed",
  description: "View the newest updates for the projects you follow on Modrinth",
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild],
  options: [
    {
      name: "project_type",
      description: "Optionally filter results by a specific project type",
      type: ApplicationCommandOptionType.String,
      choices: Object.values(ProjectTypes).map(t => ({name: projectTypesReadable[t], value: t})),
      required: false
    }
  ],
  run: async (interaction) => {
    const context = getContext(interaction);
    const dbContext = await DB.Contexts.getContext(context);
    const userDbContext = await DB.Contexts.getContext(interaction.user.id);

    const projectTypeFilter =
      interaction.options.getString("project_type", false) || null;

    let response = (
      await interaction.deferReply({
        flags: [MessageFlags.Ephemeral],
        withResponse: true,
      })
    ).resource.message;

    if (!userDbContext.token || userDbContext.authorization_expired) {
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [
          RinthComponentBuilder.textDisplay(
            "This requires authorization. Please log in with Modrinth",
          ),
          getLoginContainer(context, interaction.user.id).buildContainer(),
        ],
      });
      return;
    }

    const authorizedClient = getApiClient(userDbContext.id);

    const tokenUserRes = await authorizedClient.Users().getAuthorizedUser();

    if (tokenUserRes.error) {
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [
          RinthComponentBuilder.errorContainer(
            false,
            `${tokenUserRes.error.status} ${tokenUserRes.error.message}`,
          ).buildContainer(),
        ],
      });
      return;
    }

    const tokenUser = tokenUserRes.data;

    const followedProjectsRes = await authorizedClient
      .Users()
      .getUserFollowedProjects(tokenUser.id);

    if (followedProjectsRes.error) {
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [
          RinthComponentBuilder.errorContainer(
            false,
            `${followedProjectsRes.error.status} ${followedProjectsRes.error.message}`,
          ).buildContainer(),
        ],
      });
      return;
    }

    let followedProjects = followedProjectsRes.data;

    if (projectTypeFilter)
      followedProjects = followedProjects.filter(
        (p) => p.project_type === projectTypeFilter,
      );

    if (followedProjects.length <= 0) {
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [
          RinthComponentBuilder.errorContainer(
            false,
            `You are not following any projects${projectTypeFilter ? ` matching the filter type \`${projectTypeFilter}\`` : ""}`,
          ).buildContainer(),
        ],
      });
      return;
    }

    const withUpdates = await Promise.all(followedProjects.map(async p => {
      const hasNew = (await Promise.all((await authorizedClient.Versions().getMultipleVersions(...p.versions)).data.filter(v => new Date(v.date_published).getTime() > userDbContext.last_feed_fetched.getTime()))).length > 0;
      // return (await Promise.all(()).length > 0
      return hasNew ? p : null;
    }));

    followedProjects = withUpdates.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));

    if (followedProjects.length <= 0) {
      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [
          RinthComponentBuilder.errorContainer(
            false,
            `None of your followed projects have available updates.`,
          ).buildContainer(),
        ],
      });
      return;
    }

    const pages: Project[] = [...followedProjects];
    let perPage = 3;

    let page = 1;

    async function buildContainer(): Promise<ContainerBuilder> {
      const container = new RinthComponentBuilder().setAccentColor(
        config.brand_color,
      );
      const projects = pages.slice((page - 1) * perPage, page * perPage);

      container
        .addTextDisplay(
          `## Followed Project Updates\n-# ${followedProjects.length.toLocaleString()} Project${followedProjects.length === 1 ? "" : "s"} ${followedProjects.length === 1 ? "has" : "have"} updates since ${timestamp(userDbContext.last_feed_fetched, "f")}`,
        )
        .addSeparator();

      let i = 0;
      for (const project of projects) {
        const icon = project?.icon_url || config.images.icon;

        const versionsRes = await apiClient
          .Versions()
          .listProjectVersions(project.id);

        let versions: Version[] = [];
        if (versionsRes.data) versions = versionsRes.data || [];


        const updates = (await Promise.all(project.loaders.map(async l => {
          let defaultStr = `${await appEmoji(`loader_${l}`)} **${l}**`
          if (versions.length > 0) {
            let latestVersion = versions.filter(v => v.loaders.includes(l) && new Date(v.date_published).getTime() > userDbContext.last_feed_fetched.getTime()).sort((a, b) => new Date(b.date_published).getTime() - new Date(a.date_published).getTime())?.[0]
            if (!latestVersion) return '';

            return `- [${await appEmoji(`loader_${l}`)} **${l}**](${latestVersion.files[0].url}) - ${timestamp(new Date(latestVersion.date_published), "R")}`
          } else {

            return defaultStr
          }
        }))).filter(s => s.length > 0);

        container.addThumbnailAccessorySection(`### [${project.title}](https://modrinth.com/${project.project_type}/${project.id}) ${project.categories.filter(c => !project.environment.includes(c as any)).slice(0,3).map(c => `${inlineCode(c)}`).join(" ")}\n-# ${projectTypesReadable[project.project_type]} ⋅ ${project.status !== ProjectStatus.APPROVED ? `**${project.status}**` : `Released ${timestamp(new Date(project.published), "R")}`}\n${updates.length <= 0 ? "\nThere are no updates available" : `### New Version${updates.length === 1 ? "" : "s"}\n${updates.join("\n")}`}`, icon)



        // container.addThumbnailAccessorySection(`### [${project.title}](https://modrinth.com/${project.project_type}/${project.id}) ${project.categories.filter(c => !project.environment.includes(c as any)).slice(0,3).map(c => `${inlineCode(c)}`).join(" ")}\n-# ${projectTypesReadable[project.project_type]} ⋅ ${project.status !== ProjectStatus.APPROVED ? `**${project.status}**` : `Released ${timestamp(new Date(project.published), "R")}`} ⋅ \`📩 ${project.downloads === 0 ? "No" : formatCompactNumber(project.downloads)} ${project.project_type === ProjectTypes.MODPACK ? "Modpack " : ""}Download${project.downloads === 1 ? "" : "s"}\` \`💖 ${project.followers === 0 ? "No" : formatCompactNumber(project.followers)} Follower${project.followers === 1 ? "" : "s"}\`\n\n${loaders.join(" – ")}`, icon);

        if (i !== projects.length - 1) container.addSeparator();

        i++;
      }

      if (pages.length > perPage) {
        container.addSeparator();
        container.addButtonActionRow([
          RinthComponentBuilder.accessoryButton(
            ButtonStyle.Primary,
            "⬅️",
            null,
            null,
            parseCustomId(generateCustomId(interaction, "previous")),
          ).setDisabled(page === 1),
          RinthComponentBuilder.accessoryButton(
            ButtonStyle.Secondary,
            "🏠",
            null,
            null,
            parseCustomId(generateCustomId(interaction, "home")),
          ).setDisabled(page === 1),
          RinthComponentBuilder.accessoryButton(
            ButtonStyle.Primary,
            "➡️",
            null,
            null,
            parseCustomId(generateCustomId(interaction, "next")),
          ).setDisabled(page === Math.ceil(pages.length / perPage)),
        ]);
        container.addTextDisplay(
          `Page ${page}/${Math.ceil(pages.length / perPage)}`,
        );
      }

      return container.buildContainer();
    }

    await DB.Contexts.setValue(userDbContext.id, {last_feed_fetched: new Date()})

    await interaction.editReply({
      flags: [MessageFlags.IsComponentsV2],
      components: [await buildContainer()],
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
    });

    collector.on("collect", async (button) => {
      await button.deferUpdate();
      if (button.customId.includes("home")) {
        if (page !== 1) page = 1;
        await interaction.editReply({
          flags: [MessageFlags.IsComponentsV2],
          components: [await buildContainer()],
        });
      }

      if (button.customId.includes("previous")) {
        if (page !== 1) page -= 1;
        await interaction.editReply({
          flags: [MessageFlags.IsComponentsV2],
          components: [await buildContainer()],
        });
      }

      if (button.customId.includes("next")) {
        if (page !== Math.ceil(pages.length / perPage)) page += 1;
        await interaction.editReply({
          flags: [MessageFlags.IsComponentsV2],
          components: [await buildContainer()],
        });
      }
    });
  },
};

export default MyFeedCommand;
