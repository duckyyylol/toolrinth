import { ApplicationCommandOptionType, InteractionContextType, MessageFlags } from "discord.js";
import { Command } from "../class/Command";
import { appEmoji, avgColor, formatCompactNumber, getContext, timestamp } from "../util";
import { DB } from "../db/DB";
import { getApiClient } from "..";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import { Project, UserRoles } from "@toolrinth/lib";
import config from "../constants";

const GetUserCommand: Command = {
  enabled: true,
  name: "get_user",
  description: "Get information about a user on Modrinth",
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      name: "username_or_id",
      description: "The user on Modrinth you want to search for",
      type: ApplicationCommandOptionType.String,
      required: true
    }
  ],
  run: async interaction => {
    await interaction.deferReply();
    const context = getContext(interaction);
    const dbContext = await DB.Contexts.getContext(context);
    const apiClient = getApiClient(context);

    const username = interaction.options.getString("username_or_id", true);

    const userRes = await apiClient.Users().getUser(username);

    if (userRes.error) {
      if (userRes.error.status && userRes.error.status === 404) {
        await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `No users were found matching the name or ID \`${username}\``).buildContainer()]})
      } else {
        await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `${userRes.error.status} ${userRes.error.message}`).buildContainer()]})
      }
      return;
    }

    const user = userRes.data;

    if (!user) {
      await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `No users were found matching the name or ID \`${username}\``).buildContainer()] })
      return;
    }

    let userProjects: Project[] = [];
    let totalDownloads: number = 0;
    let totalFollowers: number = 0;

    const userProjectsRes = await apiClient.Users().getUserProjects(user.id);
    if (userProjectsRes.data) userProjects = userProjectsRes.data;

    for (const project of userProjects) {
      totalDownloads += project.downloads;
      totalFollowers += project.followers;
    }

    const container = new RinthComponentBuilder();
    const avatar = user.avatar_url || config.images.icon;
    const color = await avgColor(avatar);
    container.setAccentColor(color);

    const sectionStr = `## ${user.role === UserRoles.ADMIN ? `${await appEmoji("modrinth")}` : ""} [${user.username}](https://modrinth.com/user/${user.id})${config.official_accounts.includes(user.username.toLowerCase()) ? " `official`" : ""}\n${user.bio || "A Modrinth user."}\n\n-# **${userProjects.length.toLocaleString()} Project${userProjects.length === 1 ? "" : "s"}** ⋅ \`${totalDownloads > 10000 ? "💌" : "📩"} ${formatCompactNumber(totalDownloads)} Download${totalDownloads === 1 ? "" : "s"}\` ⋅ \`${totalFollowers > 1000 ? "💖" : "💚"} ${formatCompactNumber(totalFollowers)} Follower${totalFollowers === 1 ? "" : "s"}\``;

    container.addThumbnailAccessorySection(sectionStr, avatar);

    container.addSeparator();
    container.addTextDisplay(`**Account Created**: ${timestamp(new Date(user.created), "S")} (${timestamp(new Date(user.created), "R")})`)

    container.addSeparator()
    container.addTextDisplay(`-# User ${user.id} on Modrinth`)

    await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()]})
  }
}

export default GetUserCommand;
