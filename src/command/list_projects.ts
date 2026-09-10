import { ApplicationCommandOptionType, ButtonStyle, ComponentType, ContainerBuilder, inlineCode, InteractionContextType, makeURLSearchParams, MessageFlags, userMention } from "discord.js";
import { Command } from "../class/Command";
import { DB } from "../db/DB";
import { appEmoji, formatCompactNumber, generateCustomId, getContext, parseCustomId, timestamp } from "../util";
import { Project, ProjectStatus, ProjectTypes, Version } from "@toolrinth/lib";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import { getLoginContainer } from "./settings";
import { getApiClient } from "..";
import config from "../constants";
import { projectTypesReadable } from "../types";



const ListProjectsCommand: Command = {
  enabled: true,
  name: "list_projects",
  description: "List another user's projects on Modrinth",
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild],
  options: [
    {
      name: "username_or_id",
      description: "The user who's projects you want to view",
      type: ApplicationCommandOptionType.String,
      required: true
    },
    {
      name: "project_type",
      description: "Optionally filter results by a specific project type",
      type: ApplicationCommandOptionType.String,
      choices: Object.values(ProjectTypes).map(t => ({name: projectTypesReadable[t], value: t})),
      required: false
    },
    {
      name: "private",
      description: "Respond to this command privately? (Only you can see it)",
      type: ApplicationCommandOptionType.Boolean,
      required: false
    }
  ],
  run: async interaction => {
    const context = getContext(interaction);
    const userDbContext = await DB.Contexts.getContext(interaction.user.id);

    const username = interaction.options.getString("username_or_id", true);
    const projectTypeFilter = interaction.options.getString("project_type", false) || null;
    const isPrivate = interaction.options.getBoolean("private", false) || false;

    let response = (await interaction.deferReply({ flags: [MessageFlags.Ephemeral], withResponse: true })).resource.message;

    if (!userDbContext.token || userDbContext.authorization_expired) {
      await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.textDisplay("This requires authorization. Please log in with Modrinth"), getLoginContainer(context, interaction.user.id).buildContainer()]})
      return;
    }

    const apiClient = getApiClient(context);

    const userRes = await apiClient.Users().getUser(username);

    if (userRes.error) {
      await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `${userRes.error.status} ${userRes.error.message}`).buildContainer()]})
      return;
    }

    const user = userRes.data;

    const userProjectsRes = await apiClient.Users().getUserProjects(user.id);

    if (userProjectsRes.error) {
      await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `${userProjectsRes.error.status} ${userProjectsRes.error.message}`).buildContainer()]})
      return;
    }

    let userProjects = userProjectsRes.data;

    if (projectTypeFilter) userProjects = userProjects.filter(p => p.project_type === projectTypeFilter);

    if (userProjects.length <= 0) {
      await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `${user.username} has no projects${projectTypeFilter ? ` matching the filter type \`${projectTypeFilter}\`` : ""}`).buildContainer()]})
      return;
    }

    const pages: Project[] = [...userProjects];
    let perPage = 3;

    let totalDownloads = 0;
    let totalFollowers = 0;

    for (const project of userProjects) {
      totalDownloads+= project.downloads;
      totalFollowers += project.followers;
    }

    let page = 1;

    async function buildContainer(): Promise<ContainerBuilder> {
      const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
      const projects = pages.slice((page-1)*perPage, (page*perPage));

      container.addTextDisplay(`## Projects by [${user.username}](https://modrinth.com/user/${user.id})\n-# ${userProjects.length.toLocaleString()} Project${userProjects.length === 1 ? "" : "s"} ⋅ **${totalDownloads.toLocaleString()}** Total Download${totalDownloads === 1 ? "" : "s"} ⋅ **${totalFollowers.toLocaleString()}** Total Follower${totalFollowers === 1 ? "" : "s"}`).addSeparator();

      let i = 0;
      for (const project of projects) {
        const icon = project?.icon_url || config.images.icon;

        const latestVersionRes = await apiClient.Versions().listProjectVersions(project.id);

        let latestVersion: Version | null = null;
        if (latestVersionRes.data) latestVersion = latestVersionRes.data[0];

        const loaders = await Promise.all(project.loaders.map(async l => {
          return `${await appEmoji(`loader_${l}`)} **${l}**`
        }));

        container.addThumbnailAccessorySection(`### [${project.title}](https://modrinth.com/${project.project_type}/${project.id}) ${project.categories.filter(c => !project.environment.includes(c as any)).slice(0,3).map(c => `${inlineCode(c)}`).join(" ")}\n-# ${projectTypesReadable[project.project_type]} ⋅ ${project.status !== ProjectStatus.APPROVED ? `**${project.status}**` : `Released ${timestamp(new Date(project.published), "R")}`} ⋅ \`📩 ${project.downloads === 0 ? "No" : formatCompactNumber(project.downloads)} ${project.project_type === ProjectTypes.MODPACK ? "Modpack " : ""}Download${project.downloads === 1 ? "" : "s"}\` \`💖 ${project.followers === 0 ? "No" : formatCompactNumber(project.followers)} Follower${project.followers === 1 ? "" : "s"}\`\n\n${loaders.join(" – ")}`, icon);

        if (i !== projects.length-1) container.addSeparator();

        i++;
      }

      if (pages.length > perPage) {
        container.addSeparator();
        container.addButtonActionRow([
          RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "⬅️", null, null, parseCustomId(generateCustomId(interaction, "previous"))).setDisabled(page === 1),
          RinthComponentBuilder.accessoryButton(ButtonStyle.Secondary, "🏠", null, null, parseCustomId(generateCustomId(interaction, "home"))).setDisabled(page === 1),
          RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "➡️", null, null, parseCustomId(generateCustomId(interaction, "next"))).setDisabled(page === Math.ceil(pages.length/perPage)),
        ])
        container.addTextDisplay(`Page ${page}/${Math.ceil(pages.length / perPage)}`);
      }
      if (!isPrivate) {
        container.addSeparator().addTextDisplay(`-# Requested by ${userMention(interaction.user.id)} ⋅ ${timestamp(new Date(), "R")}`)
      }


      return container.buildContainer();
    }

    if (isPrivate) {
      await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
    } else {
      await interaction.editReply({content: `${await appEmoji("toolrinth")} **Sent Project List**`})
      response = await interaction.followUp({flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()], withResponse: true})
    }

    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, filter: i => isPrivate ? true : i.user.id === interaction.user.id });

    collector.on('collect', async button => {
      await button.deferUpdate();
      if (button.customId.includes("home")) {
        if(page !== 1) page = 1;
        if (isPrivate) {
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
        } else {
          await response.edit({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] });
        }
      }

      if (button.customId.includes("previous")) {
        if(page !== 1) page -= 1;
        if (isPrivate) {
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
        } else {
          await response.edit({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] });
        }
      }

      if (button.customId.includes("next")) {
        if(page !== Math.ceil(pages.length/perPage)) page += 1;
        if (isPrivate) {
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
        } else {
          await response.edit({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] });
        }
      }
    })
  }
}

export default ListProjectsCommand;
