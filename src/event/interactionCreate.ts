import {
  AttachmentBuilder,
  AutocompleteInteraction,
  BaseInteraction,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  Interaction,
  MessageFlags,
} from "discord.js";
import { join } from "path";
import { apiClient, desiredExt, dev_mode, logger } from "..";
import { existsSync } from "fs-extra";

import { Command } from "../class/Command";
import { avgColor, generateCustomId, parseCustomId, reply } from "../util";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import config from "../constants";

export default {
  enabled: true,
  run: async (int: BaseInteraction) => {
    async function handleSlashCommand(
      interaction: ChatInputCommandInteraction,
    ) {
      if (!interaction) return;
      if (interaction.commandName && interaction.commandName !== null) {
        let path = dev_mode
          ? join(
              process.cwd(),
              `src`,
              "command",
              `${interaction.commandName}${desiredExt}`,
            )
          : join(
              process.cwd(),
              `dist`,
              `src`,
              "command",
              `${interaction.commandName}${desiredExt}`,
            );
        if (existsSync(path)) {
          const cmd: Command = require(
            `../command/${interaction.commandName}${desiredExt}`,
          ).default;
          if (cmd && cmd.enabled && cmd.run) {
            await cmd.run(interaction);
          }
          return;
        }
      }
    }

    async function handleAutocomplete(
      autocompleteInteraction: AutocompleteInteraction,
    ) {
      let command = require(
        `../command/${autocompleteInteraction.commandName}${desiredExt}`,
      ).default;
      if (!command || !command.name || !command.run || !command.enabled)
        return logger.warn(`Skipped autocomplete`);

      try {
        await command.autocomplete(autocompleteInteraction).catch((err: any) => {
          // handleError(autocompleteInteraction, err,);
        });
      } catch (e) {
        // handleError(autocompleteInteraction, e,);
      }
    }

    async function handleButtonPress(interaction: ButtonInteraction) {
      const id = parseCustomId(interaction.customId);

      if (id.subcommand === "search") {
        const res = await interaction.deferReply({flags: [MessageFlags.Ephemeral], withResponse: true})
        if (id.action === "authors") {
          const projectId = id.command;
          const project = (await apiClient.Projects().getProject(projectId)).data;
          let members = (await apiClient.Projects().getProjectTeamMembers(projectId)).data;
          const icon = project?.icon_url || config.images.icon;
          const color = await avgColor(icon);

          const organization = project.organization ? (await apiClient.Teams().getOrganization(project.organization)).data : null;
          if (organization && members.length <= 0) members = (await apiClient.Teams().getOrganization(project.organization)).data.members;

          let p = 0;

          function container(page: number = 0): RinthComponentBuilder {
            const cont = new RinthComponentBuilder().setAccentColor(color);
            cont.addThumbnailAccessorySection(`## ${project.title} - Authors\n**Organization**: ${organization ? `[${organization.name}](<https://modrinth.com/organization/${project.organization}>)` : "None"}\n**Team Members**: ${members.length}`, icon);

            let authors: string[] = members.map(member => `- ${members.indexOf(member) + 1}. [${member.user.username}](<https://modrinth.com/user/${member.user.id}>)${member.role ? ` - *${member.role}*` : ""}`);

            const pages: string[] = [];

            for (var i = 0; i < authors.length; i += 10) {
              pages.push(authors.slice(i, i+10).join("\n"))
            }

            if (pages.length > 1) {
              cont.addTextDisplay(pages[page])
              cont.addSeparator();
              cont.addButtonActionRow([
                RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "⬅️", null, null, parseCustomId(generateCustomId(interaction, "previous"))).setDisabled(page === 0),
                RinthComponentBuilder.accessoryButton(ButtonStyle.Secondary, "🏠", null, null, parseCustomId(generateCustomId(interaction, "home"))).setDisabled(page === 0),
                RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "➡️", null, null, parseCustomId(generateCustomId(interaction, "next"))).setDisabled(page + 1 === pages.length),
              ])
              cont.addTextDisplay(`-# Page ${page + 1}/${pages.length}`)
            } else {
              cont.addTextDisplay(pages[0]);
            }

            return cont;
          }



          await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [container().buildContainer()]});

          const collector = res.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button });

          collector.on("collect", async button => {
            await button.deferUpdate();
            const action = parseCustomId(button.customId).action;

            if (action === "previous" && p !== 0) {
              p -= 1;
              await interaction.editReply({components: [container(p).buildContainer()]})
            }
            if (action === "home" && p !== 0) {
              p = 0;
              await interaction.editReply({components: [container(p).buildContainer()]})
            }
            if (action === "next") {
              p += 1;
              await interaction.editReply({components: [container(p).buildContainer()]})
            }
          })
        }
        if (id.action === "versions") {
          const projectId = id.command;
          const project = (await apiClient.Projects().getProject(projectId)).data;
          const icon = project?.icon_url || config.images.icon;
          const color = await avgColor(icon);


          let p = 0;

          async function container(page: number = 0): Promise<RinthComponentBuilder> {
            const cont = new RinthComponentBuilder().setAccentColor(color);

            let versions: string[] = (await Promise.all(project.game_versions.map(async v => {
              const ver = ((await apiClient.Versions().listProjectVersions(projectId)).data || []).filter(vv => vv && vv.version_number != null && vv.game_versions.includes(v))[0];

              return ver ? `[\`${v}\`](<https://modrinth.com/${project.project_type}/${project.id}/version/${ver.version_number}>)` : `\`${v}\``
            }))).filter(v => v !== null);

            cont.addThumbnailAccessorySection(`## ${project.title} - Game Versions\n**Latest Supported Version**: ${versions[versions.length-1]}\n**Oldest Supported Version**: ${versions[0]}`, icon);

            const pages: string[] = [];

            for (var i = 0; i < versions.length; i += 30) {
              pages.push(versions.slice(i, i+30).join(" "))
            }

            if (pages.length > 1) {
              cont.addTextDisplay(pages[page])
              cont.addSeparator();
              cont.addButtonActionRow([
                RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "⬅️", null, null, parseCustomId(generateCustomId(interaction, "previous"))).setDisabled(page === 0),
                RinthComponentBuilder.accessoryButton(ButtonStyle.Secondary, "🏠", null, null, parseCustomId(generateCustomId(interaction, "home"))).setDisabled(page === 0),
                RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "➡️", null, null, parseCustomId(generateCustomId(interaction, "next"))).setDisabled(page + 1 === pages.length),
              ])
              cont.addTextDisplay(`-# Page ${page + 1}/${pages.length}`)
            } else {
              cont.addTextDisplay(pages[0]);
            }

            return cont;
          }



          await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [(await container()).buildContainer()]});

          const collector = res.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button });

          collector.on("collect", async button => {
            await button.deferUpdate();
            const action = parseCustomId(button.customId).action;

            try {
              if (action === "previous" && p !== 0) {
                p -= 1;
                await interaction.editReply({ components: [(await container(p)).buildContainer()] })
              }
              if (action === "home" && p !== 0) {
                p = 0;
                await interaction.editReply({ components: [(await container(p)).buildContainer()] })
              }
              if (action === "next") {
                p += 1;
                await interaction.editReply({ components: [(await container(p)).buildContainer()] })
              }
            } catch (e) { }
          })
        }
        if (id.action === "gallery") {
          const projectId = id.command;
          const project = (await apiClient.Projects().getProject(projectId)).data;
          const icon = project?.icon_url || config.images.icon;
          const color = await avgColor(icon);


          let p = 0;

          async function container(page: number = 0): Promise<RinthComponentBuilder> {
            const cont = new RinthComponentBuilder().setAccentColor(color);

            cont.addTextDisplay(`## ${project.title} - Gallery`);

            const pages: { title?: string; description?: string; url: string; }[] = [];

            for (var i = 0; i < project.gallery.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0)).length; i += 1) {
              const item = project.gallery[i];
              pages.push({title: item.title, description: item.description, url: item.url})
            }

            if (pages.length > 1) {
              let title = pages[page].title;
              let description = pages[page].description;
              let url = pages[page].url;

              cont.addMediaGallery([{ media: { url } }]);
              if (title) cont.addTextDisplay(`### ${title}`);
              if (description) cont.addTextDisplay(`> *${description}*`);

              cont.addSeparator();
              cont.addButtonActionRow([
                RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "⬅️", null, null, parseCustomId(generateCustomId(interaction, "previous"))).setDisabled(page === 0),
                RinthComponentBuilder.accessoryButton(ButtonStyle.Secondary, "🏠", null, null, parseCustomId(generateCustomId(interaction, "home"))).setDisabled(page === 0),
                RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "➡️", null, null, parseCustomId(generateCustomId(interaction, "next"))).setDisabled(page + 1 === pages.length),
              ])
              cont.addTextDisplay(`-# Image ${page + 1}/${pages.length}`)
            } else {
              let title = pages[page].title;
              let description = pages[page].description;
              let url = pages[page].url;

              cont.addMediaGallery([{ media: { url }, description }]);
              if (title) cont.addTextDisplay(`### ${title}`);
              if (description) cont.addTextDisplay(`> *${description}*`);
            }

            return cont;
          }

          await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [(await container()).buildContainer()]});

          const collector = res.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button });

          collector.on("collect", async button => {
            await button.deferUpdate();
            const action = parseCustomId(button.customId).action;

            if (action === "previous" && p !== 0) {
              p -= 1;
              await interaction.editReply({components: [(await container(p)).buildContainer()]})
            }
            if (action === "home" && p !== 0) {
              p = 0;
              await interaction.editReply({components: [(await container(p)).buildContainer()]})
            }
            if (action === "next") {
              p += 1;
              await interaction.editReply({components: [(await container(p)).buildContainer()]})
            }
          })
        }
      }
    }

    if (int.isChatInputCommand())
      await handleSlashCommand(int as ChatInputCommandInteraction);
    if (int.isButton()) await handleButtonPress(int as ButtonInteraction);
    if (int.isAutocomplete())
      await handleAutocomplete(int as AutocompleteInteraction);
  },
};
