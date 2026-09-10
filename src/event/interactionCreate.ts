import {
  AttachmentBuilder,
  AutocompleteInteraction,
  BaseInteraction,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  ContainerBuilder,
  inlineCode,
  Interaction,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import { join } from "path";
import { apiClient, desiredExt, dev_mode, getApiClient, logger } from "..";
import { existsSync } from "fs-extra";

import { Command } from "../class/Command";
import { appEmoji, avgColor, formatCompactNumber, generateCustomId, getContext, getContextType, parseCustomId, reply, timestamp } from "../util";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import config from "../constants";
import { DB } from "../db/DB";
import { Project, ProjectStatus, ProjectTypes, TeamMember, UserRoles, Version } from "@toolrinth/lib";
import { notification_types_readable } from "../db/schema";
import { projectTypesReadable } from "../types";

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
      const context = getContext(interaction);
      const apiClient = getApiClient(context);

      if (id.action === "show-team-projects") {
        const res = await interaction.deferReply({ flags: [MessageFlags.Ephemeral], withResponse: true });
        const teamId = id.command;

        const organizationRes = await apiClient.Teams().getOrganization(teamId);
        if (!organizationRes.data || organizationRes.error) return await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `Failed to fetch organization \`${teamId}\``).buildContainer()] })

        const organization = organizationRes.data;

        const teamProjectsRes = await apiClient.Teams().getOrganizationProjects(organization.id);
        if (!teamProjectsRes.data || teamProjectsRes.error) return await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `Failed to fetch projects for organization \`${organization.id}\``).buildContainer()] })

        const teamProjects = teamProjectsRes.data;

        let totalDownloads = 0;
        let totalFollowers = 0;

        for (const project of teamProjects) {
          totalDownloads += project.downloads;
          totalFollowers += project.followers;
        }

        const pages: Project[] = [...teamProjects.sort((a, b) => a.title.localeCompare(b.title))];

        let page = 1;
        let perPage = 3;

        async function buildContainer(): Promise<ContainerBuilder> {
          const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
          const projects = pages.slice((page-1)*perPage, (page*perPage));

          container.addTextDisplay(`## Projects by [${organization.name}](https://modrinth.com/organization/${organization.id})\n-# ${teamProjects.length.toLocaleString()} Project${teamProjects.length === 1 ? "" : "s"} ⋅ **${totalDownloads.toLocaleString()}** Total Download${totalDownloads === 1 ? "" : "s"} ⋅ **${totalFollowers.toLocaleString()}** Total Follower${totalFollowers === 1 ? "" : "s"}`).addSeparator();

          let i = 0;
          for (const project of projects) {
            const icon = project?.icon_url || config.images.icon;

            // const latestVersionRes = await apiClient.Versions().listProjectVersions(project.id);

            // let latestVersion: Version | null = null;
            // if (latestVersionRes.data) latestVersion = latestVersionRes.data[0];

            const loaders = await Promise.all(project.loaders.map(async l => {
              return `${await appEmoji(`loader_${l}`) || await appEmoji("modrinth")} **${l}**`
            }));

            container.addThumbnailAccessorySection(`### [${project.title}](https://modrinth.com/${project.project_type}/${project.id}) ${project.categories.filter(c => !(project.environment || []).includes(c as any)).slice(0,3).map(c => `${inlineCode(c)}`).join(" ")}\n-# ${projectTypesReadable[project.project_type]} ⋅ ${project.status !== ProjectStatus.APPROVED ? `**${project.status}**` : `Released ${timestamp(new Date(project.published), "R")}`} ⋅ \`📩 ${project.downloads === 0 ? "No" : formatCompactNumber(project.downloads)} ${project.project_type === ProjectTypes.MODPACK ? "Modpack " : ""}Download${project.downloads === 1 ? "" : "s"}\` \`💖 ${project.followers === 0 ? "No" : formatCompactNumber(project.followers)} Follower${project.followers === 1 ? "" : "s"}\`\n\n${loaders.join(" – ")}`, icon);

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

          return container.buildContainer();
        }

        const response = res.resource.message;

        await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()]})

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button });

        collector.on('collect', async button => {
          await button.deferUpdate();
          if (button.customId.includes("home")) {
            if(page !== 1) page = 1;
              await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
          }

          if (button.customId.includes("previous")) {
            if(page !== 1) page -= 1;
              await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
          }

          if (button.customId.includes("next")) {
            if(page !== Math.ceil(pages.length/perPage)) page += 1;
              await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
          }
        })
      }

      if (id.action === "show-team-members") {
        const res = await interaction.deferReply({ flags: [MessageFlags.Ephemeral], withResponse: true });
        const teamId = id.command;

        const organizationRes = await apiClient.Teams().getOrganization(teamId);
        if (!organizationRes.data || organizationRes.error) return await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `Failed to fetch organization \`${teamId}\``).buildContainer()] })

        const organization = organizationRes.data;

        const teamMembersRes = await apiClient.Teams().getTeamMembers(organization.team_id);
        if (!teamMembersRes.data || teamMembersRes.error) return await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, `Failed to fetch members for organization \`${organization.id}\``).buildContainer()] })

        const teamMembers = teamMembersRes.data;

        const pages: TeamMember[] = [...teamMembers.sort((a, b) => a.user.username.localeCompare(b.user.username))];

        let page = 1;
        let perPage = 3;

        async function buildContainer(): Promise<ContainerBuilder> {
          const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
          const members = pages.slice((page-1)*perPage, (page*perPage));

          container.addTextDisplay(`## Members in Organization [${organization.name}](https://modrinth.com/organization/${organization.id})\n-# ${teamMembers.length.toLocaleString()} Member${teamMembers.length === 1 ? "" : "s"}`).addSeparator();

          let i = 0;
          for (const member of members) {
            const icon = member.user.avatar_url || config.images.icon;

            const user = member.user;

            const str = `### ${user.role === UserRoles.ADMIN ? `${await appEmoji("modrinth")}` : ""} [${user.username}](https://modrinth.com/user/${user.id})${config.official_accounts.includes(user.username.toLowerCase()) ? " `official`" : ""}\n-# ${member.role}\n\n${user.bio || "A Modrinth user."}`;

            container.addThumbnailAccessorySection(str, icon);

            if (i !== members.length-1) container.addSeparator();

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

          return container.buildContainer();
        }

        const response = res.resource.message;

        await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()]})

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button });

        collector.on('collect', async button => {
          await button.deferUpdate();
          if (button.customId.includes("home")) {
            if(page !== 1) page = 1;
              await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
          }

          if (button.customId.includes("previous")) {
            if(page !== 1) page -= 1;
              await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
          }

          if (button.customId.includes("next")) {
            if(page !== Math.ceil(pages.length/perPage)) page += 1;
              await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [await buildContainer()] })
          }
        })
      }


      if (id.action === "view-notif") {
        const res = await interaction.deferReply({ flags: [MessageFlags.Ephemeral], withResponse: true });

        const nId = id.command;

        const tokenUserRes = await getApiClient(context).Users().getAuthorizedUser();
        if (tokenUserRes.error || !tokenUserRes.data) return;

        const tokenUser = tokenUserRes.data;

        const nRes = await getApiClient(context).Users().getUserNotifications(tokenUser.id);
        if (!nRes.data || nRes.error) return;

        const allNotifications = nRes.data;
        const notification = allNotifications.find(n => n.id === nId);
        if (!notification) return;

        let title = notification.title;
        let body = notification.text;

        if (body.includes("to Rejected")) title = `Project status changed to ${await appEmoji("status_rejected")} __Rejected__`;
        if (body.includes("to Under Review")) title = `Project status changed to ${await appEmoji("status_processing")} __Under Review__`;
        if (body.includes("to Listed")) title = `Project status changed to ${await appEmoji("status_approved")} __Public__`;
        if (body.includes("to Unlisted")) title = `Project status changed to ${await appEmoji("status_unlisted")} __Unlisted__`;
        if (body.includes("to Private")) title = `Project status changed to ${await appEmoji("status_private")} __Private__`;

        if (body.startsWith("The project ")) {
          let split = body.split("The project ")[1].split(" ").slice(0, 1);
          let pId = split[0].trim();

          let project: Project | null = null;
            const projectRes = await getApiClient(context).Projects().getProject(pId);
            if (projectRes.data) {
              project = projectRes.data;
            }

          if(project) body = body.replaceAll(pId, `**${project.title}**`)
        }

        if (body.includes("a new version: ")) {
          let vId = body.split("a new version: ")[1].split(" ")[0].trim();
          const versionRes = await getApiClient(context).Versions().getVersionById(vId);
          let version: Version | null = null;
          if (versionRes.data) {
            version = versionRes.data;
          }

          if(version) body = body.replaceAll(vId, `[**${(version.version_number || version.name)}**](${version.files[0].url})`)
        }

        const container = new RinthComponentBuilder().setAccentColor(config.brand_color);
        container.addTextDisplay(`## ${title}\n-# ${await appEmoji(`message_${notification.type}`)} \`${notification_types_readable[notification.type]}\` ⋅ Received ${timestamp(new Date(notification.created), "F")}`);
        container.addSeparator().addTextDisplay(body);

        if (notification.link) {
          container.addSeparator().addButtonActionRow([RinthComponentBuilder.accessoryButton(ButtonStyle.Link, "View Attached Link", `https://modrinth.com${notification.link}`), RinthComponentBuilder.accessoryButton(ButtonStyle.Link, "View All Notifications", `https://modrinth.com/dashboard/notifications`)])
        }

        await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [container.buildContainer()]})
      }

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

          const gameVers = ((await apiClient.Versions().listProjectVersions(projectId)).data || []);

          async function container(page: number = 0): Promise<RinthComponentBuilder> {
            const cont = new RinthComponentBuilder().setAccentColor(color);

            let versions: string[] = (await Promise.all(project.game_versions.map(async v => {
              const ver = gameVers.filter(vv => vv && vv.version_number != null && vv.game_versions.includes(v))[0];

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

    const context = getContext(int as Interaction);
    const dbContext = DB.Contexts.getContext(context);
    if(!dbContext) DB.Contexts.createContext({id: context, type: getContextType(int as Interaction)})

    if (int.isChatInputCommand())
      await handleSlashCommand(int as ChatInputCommandInteraction);
    if (int.isButton()) await handleButtonPress(int as ButtonInteraction);
    if (int.isAutocomplete())
      await handleAutocomplete(int as AutocompleteInteraction);
  },
};
