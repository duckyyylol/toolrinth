import { ApplicationCommandOptionType, ApplicationIntegrationType, ButtonStyle, ComponentType, inlineCode, InteractionContextType, MessageFlags } from "discord.js";
import { Command } from "../class/Command";
import { generateCustomId, getContext, getContextType, parseCustomId } from "../util";
import { ContextTypes } from "../types";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import { DB } from "../db/DB";
import config from "../constants";
import { getLoginContainer } from "./settings";
import { notification_relays, notification_types, notification_types_readable } from "../db/schema";


const NotificationsCommand: Command = {
  enabled: true,
  name: "notifications",
  description: "Manage your Modrinth notifications",
  integrationTypes: [ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM],
  options: [
    {
      name: "relay",
      description: "Manage Modrinth notification relay",
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: "disable_relay",
      description: "Disable Modrinth notification relay",
      type: ApplicationCommandOptionType.Subcommand,
    }
  ],
  run: async interaction => {
    const context = getContext(interaction);
    const contextType = getContextType(interaction);
    const subcommand = interaction.options.getSubcommand(true);

    if (contextType !== ContextTypes.USER) return interaction.reply({ flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral], components: [RinthComponentBuilder.errorContainer(false, "You can not do that in this context").buildContainer()] });

    const dbContext = await DB.Contexts.getContext(context) || await DB.Contexts.createContext({id: context, type: contextType});

    const response = await interaction.deferReply({ flags: [MessageFlags.Ephemeral], withResponse: true });

    switch (subcommand) {
      case "relay": {
        // TODO: replace with actual interactive menu
        let relay = await DB.Relays.ensureRelay(context);

        if (!dbContext.token || dbContext.authorization_expired) {
          await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.textDisplay("This requires authorization. Please log in with Modrinth"), getLoginContainer(context, interaction.user.id).buildContainer()]})
          return;
        }

        async function buildContainer(relay: typeof notification_relays.$inferInsert): Promise<RinthComponentBuilder> {
          const includedNotificationTypes = notification_types.filter(n => !relay.excluded_types.includes(n));
          const container = new RinthComponentBuilder().setAccentColor(config.brand_color);

          container.addTextDisplay(`## Manage Notification Relay`).addSeparator();

          container.addButtonAccessorySection(`${relay.enabled ? "Disable" : "Enable"} Relay`, relay.enabled ? ButtonStyle.Danger : ButtonStyle.Success, relay.enabled ? "Disable" : "Enable", parseCustomId(generateCustomId(interaction, `${relay.enabled ? "disable" : "enable"}-relay`))).addSeparator();

          container.addTextDisplay(`### Notification Types\n-# Select the notification types you'd like to have relayed. De-select the ones you don't want.`)
          container.addStringSelectMenu(parseCustomId(generateCustomId(interaction, "notification-types")), "Click to select...", notification_types.filter(n => notification_types_readable[n]).map(n => ({label: notification_types_readable[n], value: n, default: includedNotificationTypes.includes(n)})), false, 1, notification_types.length)

          return container;
        }

        await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [(await buildContainer(relay)).buildContainer()] });

        const buttonCollector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button });
        const selectCollector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.StringSelect });

        buttonCollector.on("collect", async button => {
          await button.deferUpdate();

          if (button.customId.includes("enable") || button.customId.includes("disable")) {
            relay = await DB.Relays.toggleRelay(context);
            await interaction.followUp({flags: [MessageFlags.Ephemeral], content: `${relay.enabled ? "Enabled" : "Disabled"} Notification Relay!`})
            await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [(await buildContainer(relay)).buildContainer()] });
          }
        });

        buttonCollector.on("end", async (cols, reason) => {
          await interaction.editReply({content: `Interaction ended with reason \`${reason}\``})
        })

        selectCollector.on("collect", async select => {
          await select.deferUpdate();

          if (select.customId.includes("notification-types")) {
            let types = select.values;
            let excluded = notification_types.filter(n => !types.includes(n));

            relay = await DB.Relays.updateRelay(context, { excluded_types: excluded });
            await interaction.followUp({flags: [MessageFlags.Ephemeral], content: `### Updated Notification Relay Types\n-# Excluded\n${excluded.length > 0 ? excluded.map(e => `- ${inlineCode(notification_types_readable[e])}`).join("\n") : "None"}\n\n-# Included\n${types.length > 0 ? types.map(e => `- ${inlineCode(notification_types_readable[e])}`).join("\n") : "None"}\n\n-# **Only Included types will be relayed**`})
            await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [(await buildContainer(relay)).buildContainer()] });
          }
        });

        selectCollector.on("end", async (cols, reason) => {
          await interaction.editReply({content: `Interaction ended with reason \`${reason}\``})
        })

        break;
      }

      case "disable_relay": {
        let relay = await DB.Relays.ensureRelay(context);

        if (!relay.enabled) return await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, "Notification relay is already disabled.").buildContainer()] })

        await DB.Relays.toggleRelay(context);

        const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
        container.addTextDisplay(`Successfully disabled notification relay`)

        await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()] });

        break;
      }
    }
  }
}

export default NotificationsCommand;
