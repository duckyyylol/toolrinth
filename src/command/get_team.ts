import { ApplicationCommandOptionType, ButtonStyle, InteractionContextType, MessageFlags, SeparatorSpacingSize } from "discord.js";
import { Command } from "../class/Command";
import { appEmoji, avgColor, createCustomId, formatCompactNumber, generateCustomId, getContext, parseCustomId, timestamp } from "../util";
import { DB } from "../db/DB";
import { getApiClient } from "..";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import { Project } from "@toolrinth/lib";
import config from "../constants";

const GetTeamCommand: Command = {
  enabled: true,
  name: "get_team",
  description: "Get information about a team/organization on Modrinth",
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      name: "slug_or_id",
      description: "The team/organization on Modrinth you want to search for",
      type: ApplicationCommandOptionType.String,
      required: true
    }
  ],
  run: async interaction => {
    await interaction.deferReply();
    const context = getContext(interaction);
    const dbContext = await DB.Contexts.getContext(context);
    const apiClient = getApiClient(context);

    const slug = interaction.options.getString("slug_or_id", true);

    const teamRes = await apiClient.Teams().getOrganization(slug);

    if (teamRes.error) {
      if (teamRes.error.status && teamRes.error.status === 404) {
        await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `No organizations were found matching the slug or ID \`${slug}\``).buildContainer()]})
      } else {
        await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `${teamRes.error.status} ${teamRes.error.message}`).buildContainer()]})
      }
      return;
    }

    const organization = teamRes.data;

    if (!organization) {
      await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `No organizations were found matching the slug or ID \`${slug}\``).buildContainer()] })
      return;
    }

    let teamProjects: Project[] = [];
    let totalDownloads: number = 0;
    let totalFollowers: number = 0;

    const teamProjectsRes = await apiClient.Teams().getOrganizationProjects(organization.id);

    if (teamProjectsRes.data) teamProjects = teamProjectsRes.data;

    for (const project of teamProjects) {
      totalDownloads += project.downloads;
      totalFollowers += project.followers;
    }

    let isInChannel = [InteractionContextType.BotDM, InteractionContextType.Guild].includes(interaction.context);

    const container = new RinthComponentBuilder();
    const avatar = organization.icon_url || config.images.icon;
    const color = await avgColor(avatar);
    container.setAccentColor(color);

    const sectionStr = `## [${organization.name}](https://modrinth.com/user/${organization.id})${organization.name.toLowerCase() === "modrinth" ? " `official`" : ""}\n${organization.description || "A Modrinth organization."}\n\n-# ${teamProjects.length > 0 ? `${!isInChannel ? `**${teamProjects.length.toLocaleString()} Project${teamProjects.length === 1 ? "" : "s"}** ⋅ ` : ""}` : ""}\`${totalDownloads > 10000 ? "💌" : "📩"} ${formatCompactNumber(totalDownloads)} Download${totalDownloads === 1 ? "" : "s"}\` ⋅ \`${totalFollowers > 1000 ? "💖" : "💚"} ${formatCompactNumber(totalFollowers)} Follower${totalFollowers === 1 ? "" : "s"}\`${!isInChannel ? `\n\n**Team Members**: ${organization.members.length.toLocaleString()}` : ""}`;

    container.addThumbnailAccessorySection(sectionStr, avatar);

    if (isInChannel) {
      container.addSeparator(SeparatorSpacingSize.Small, false).addButtonAccessorySection(`**Team Members**: ${organization.members.length.toLocaleString()}`, ButtonStyle.Secondary, "View Members", parseCustomId(createCustomId({ interactionId: interaction.id, action: "show-team-members", command: organization.id })))

      if(teamProjects.length > 0) container.addSeparator(SeparatorSpacingSize.Small, false).addButtonAccessorySection(`**Projects**: ${teamProjects.length.toLocaleString()}`, ButtonStyle.Secondary, "View Projects", parseCustomId(createCustomId({interactionId: interaction.id, action: "show-team-projects", command: organization.id})))
    }

    container.addSeparator()
    container.addTextDisplay(`-# Organization ${organization.id} on Modrinth`)

    await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()]})
  }
}

export default GetTeamCommand;
