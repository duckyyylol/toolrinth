import { ApplicationCommandOptionType, ButtonStyle, channelMention, ChannelType, ContextMenuCommandAssertions, InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { Command } from "../class/Command";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import config from "../constants";
import { getContext, getContextType } from "../util";
import { DB } from "../db/DB";
import { ContextTypes } from "../types";
import { setApiClient } from "..";

export const getLoginContainer = (contextId: string, userId: string): RinthComponentBuilder => {
  const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
  container.addTextDisplay(`## Login\nClick the button below to log in with Modrinth`)

  container.addSeparator().addButtonActionRow([RinthComponentBuilder.accessoryButton(ButtonStyle.Link, "Log In", `${process.env.AUTH_URL}/${contextId}/${userId}`)])

  container.addSeparator().addTextDisplay("-# You will receive a DM when you've authorized successfully. You may dismiss this message once you've pressed the button.")

  return container
}

const SettingsCommand: Command = {
  enabled: true,
  name: "settings",
  description: "Manage Toolrinth settings",
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      name: "login",
      description: "Authorize with Modrinth to enable features that require it",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "logout",
      description: "Disable Modrinth authorization",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "tracking_channel",
      description: "Set the DEFAULT channel used for Project Tracking.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "The new default tracking channel",
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
          required: true
        }
      ]
    }
  ],
  run: async interaction => {
    const subcommand = interaction.options.getSubcommand(true);
    const context = getContext(interaction);
    const contextType = getContextType(interaction);
    const dbContext = await DB.Contexts.getContext(context) || await DB.Contexts.createContext({id: context, type: getContextType(interaction)});

    switch (subcommand) {
      case "login": {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        if (contextType === ContextTypes.GUILD && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, "You do not have permission to do that in this server. Run the command in DMs if you intended to login personally.").buildContainer()] })
          return;
        }

        const container = getLoginContainer(context, interaction.user.id);

        await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()] });

        break;
      }

      case "logout": {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        if (contextType === ContextTypes.GUILD && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, "You do not have permission to do that in this server. Run the command in DMs if you intended to logout personally.").buildContainer()] })
          return;
        }

        if (!dbContext.token) {
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, "This context is not authorized.").buildContainer()] })
          return;
        }

        await DB.Auth.removeAuth(context);
        setApiClient(context);

        const container = new RinthComponentBuilder().setAccentColor(config.brand_color).addTextDisplay(`Successfully logged out`);

        await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()] });

        break;
      }

      case "tracking_channel": {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        if (contextType === ContextTypes.USER) return interaction.editReply({ components: [RinthComponentBuilder.errorContainer(false, "You can not do that in this context.").buildContainer()], flags: [MessageFlags.IsComponentsV2] })

        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, "You do not have permission to do that in this server.").buildContainer()] })
          return;
        }

        const channel = interaction.options.getChannel("channel", true);
        if(channel.id === dbContext.default_tracking_channel) return interaction.editReply({components: [RinthComponentBuilder.errorContainer(false, `The default tracking channel is already set to ${channelMention(dbContext.default_tracking_channel)}`).buildContainer()], flags: [MessageFlags.IsComponentsV2]})

        const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
        container.addTextDisplay(`Set default tracking channel to ${channelMention(channel.id)}`)

        DB.Contexts.setValue(context, { default_tracking_channel: channel.id });

        await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()] });

        break;
      }
    }
  }
}

export default SettingsCommand;
