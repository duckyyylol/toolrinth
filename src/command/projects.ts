import { ApplicationCommandOptionType, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, channelMention, ChannelType, ComponentAssertions, ComponentType, inlineCode, MessageFlags, PermissionFlagsBits, RoleSelectMenuInteraction, SeparatorBuilder, SeparatorSpacingSize, TextChannel } from "discord.js";
import { Command } from "../class/Command";
import { allProjectTypes, appEmoji, avgColor, createCustomId, formatCompactNumber, formatTime, generateCustomId, getLatestProjectVersion, parseCustomId, reply, sendTrackingIntro, sendTrackingOutro, timestamp } from "../util";
import { apiClient, logger, sendTrackedProjectUpdate } from "..";
import { FacetBuilder, FacetOperations, Facets, GameVersionTypes, Project, ProjectTypes } from "modrinth-api-client";
import { RinthComponentBuilder } from "../class/ComponentBuilder";
import config from "../constants";
import { DB } from "../db/DB";

let projectTypes: string[] = [
  'mod',
  'modpack',
  'resourcepack',
  'shader',
  'plugin',
  'datapack',
  'minecraft_java_server'
];

const ProjectsCommand: Command = {
  enabled: true,
  name: "projects",
  description: "Get information relating to projects",
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  options: [
    {
      name: "search",
      description: "Search projects on Modrinth",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "query",
          description: "Search for a project by name...",
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
          required: true
        },
        {
          name: "project_type",
          description: "Filter by a specific project type",
          type: ApplicationCommandOptionType.String,
          choices: projectTypes.map(t => ({name: t, value: t})),
          required: false
        }
      ]
    },
    {
      name: "track",
      description: "Track updates for a project on Modrinth",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "query",
          description: "Search for a project by name...",
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
          required: true
        },
        {
          name: "game_version",
          description: "Search for a supported game version...",
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
          required: true
        },
        {
          name: "send_initial_version",
          description: "Send the current latest version as an initial update?",
          type: ApplicationCommandOptionType.Boolean,
          required: false
        }
      ]
    },
    {
      name: "stop_tracking",
      description: "Stop tracking updates for a project on Modrinth",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "project",
          description: "Search for a tracked project by name...",
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
          required: true
        },
      ]
    }
  ],
  autocomplete: async interaction => {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "query") {
      const query = focused.value.trim();
      const filterType = interaction.options.getString("project_type", false);

      if (!query || query === "") return interaction.respond([{ name: "Search for a project by name...", value: "0" }]);

      let facets = new FacetBuilder();

      if (filterType && filterType !== "") facets.addFacet(Facets.PROJECT_TYPE, FacetOperations.EQUALS, filterType);

      let results = await apiClient.Projects().searchProjects(query, facets.build(), 10);

      if (results.error) return interaction.respond([{ name: `An Error Occurred: ${results.error.status} ${results.error.message}`, value: "0" }]);
      if (!results.data || results.data.hits.length <= 0) return interaction.respond([{ name: `No Results Found...`, value: "0" }]);

      interaction.respond(results.data.hits.map(project => ({ name: project.title, value: project.project_id })));
    }

    if (focused.name === "game_version") {
      const query = focused.value.trim();
      const projectId = interaction.options.getString("query", true).trim();

      if (!projectId || projectId === "") return interaction.respond([{ name: "Search for a project first...", value: "0" }]);

      const pRes = await apiClient.Projects().getProject(projectId);

      if (!pRes.data) return interaction.respond([{ name: "Search for a project first...", value: "0" }]);

      const project = pRes.data;

      let results = [...project.game_versions.reverse()].filter(v => v.toLowerCase().includes(query.toLowerCase())).slice(0,24);

      if (!results || results.length <= 0) return interaction.respond([{ name: `No Results Found...`, value: "0" }]);


      interaction.respond(results.map(v => ({ name: v, value: v })));
    }

    if (focused.name === "project") {
      const query = focused.value.trim();

      const pRes = (await Promise.all(DB.Guilds.getAllTrackedProjects().filter(p => p.guild_id === interaction.guildId).map(async p => {
        return (await apiClient.Projects().getProject(p.project_id)).data || null;
      }))).filter(v => v !== null);

      if (!pRes || pRes.length === 0) return interaction.respond([{ name: "Search for a tracked project first...", value: "0" }]);

      if(!query || query === "") return interaction.respond(pRes.map(v => ({ name: v.title, value: v.id })));

      let results = [...pRes.filter(p => p.title.toLowerCase().includes(query.toLowerCase()))].slice(0,24);

      if (!results || results.length <= 0) return interaction.respond([{ name: `No Results Found...`, value: "0" }]);

      interaction.respond(results.map(v => ({ name: v.title, value: v.id })));
    }
  },
  run: async interaction => {
    const subcommand = interaction.options.getSubcommand(true);

    if(!["search"].includes(subcommand) && !interaction.channel) return reply(interaction, RinthComponentBuilder.errorContainer(false, `You can not do that in this context.`), true);

    switch (subcommand) {
      case "search": {
        const projectId = interaction.options.getString("query", true);
        let res = await apiClient.Projects().getProject(projectId);
        if (res.error) return reply(interaction, RinthComponentBuilder.errorContainer(false, `${res.error.status} ${res.error.message}`), true);

        await interaction.deferReply();

        const project = res.data;
        let teamMembers = (await apiClient.Projects().getProjectTeamMembers(projectId)).data.sort((a, b) => b.ordering - a.ordering);
        const gameVersions = (await apiClient.Tags().getGameVersions()).data;
        const nonReleaseVersions = [...((await apiClient.Tags().getGameVersions(GameVersionTypes.ALPHA)).data), ...((await apiClient.Tags().getGameVersions(GameVersionTypes.BETA)).data), ...((await apiClient.Tags().getGameVersions(GameVersionTypes.SNAPSHOT)).data)];

        const icon = project?.icon_url || config.images.icon;
        const color = await avgColor(icon);

        const urls: Record<string, string> = {};
        if (project.source_url) urls["Source Code"] = project.source_url;
        if (project.wiki_url) urls["Wiki"] = project.wiki_url;
        if (project.issues_url) urls["Issues"] = project.issues_url;
        if (project.discord_url) urls["Discord"] = project.discord_url;


        const donationUrls: Record<string, string> = {};
        if (project.donation_urls.length > 0) {
          for (const platform of project.donation_urls) {
            donationUrls[platform.platform] = platform.url;
          }
        }

        const organization = (await apiClient.Teams().getOrganization(project.organization)).data;
        if (organization && teamMembers.length <= 0) teamMembers = (await apiClient.Teams().getOrganization(project.organization)).data.members;

        const hasUrls = Object.entries(urls).length > 0 || Object.entries(donationUrls).length > 0;

        const newestVersion = (await apiClient.Versions().listProjectVersions(projectId)).data[0];
        const newestVersionDate = new Date(newestVersion.date_published);

        const publishedDate = new Date(project.published);

        const container = new RinthComponentBuilder().setAccentColor(color);
        container.addThumbnailAccessorySection(`## [${project.title}](https://modrinth.com/${project.project_type}/${project.id})\nBy ${organization ? `[${organization.name}](<https://modrinth.com/organization/${project.organization}>)${teamMembers.length > (project.organization ? 1 : 2) ? "," : ""} ` : ""}${`${teamMembers.slice(0,project.organization ? 1 : 2).map(tm => `[${tm.user.username}](https://modrinth.com/user/${tm.user.id})`).join(teamMembers.length > (project.organization ? 1 : 2) ? ", " : " & ")}`}${teamMembers.length > 2 ? `, *and ${teamMembers.length - 1} more...*` : ""}\n> *${project.description}*\n\n-# Last Updated ${timestamp(newestVersionDate, "R")}`, icon);

        if ([...project.additional_categories, ...project.categories].length > 0) {
          container.addSeparator(SeparatorSpacingSize.Small, false);

          container.addTextDisplay(`### Tags\n${[...project.additional_categories, ...project.categories].map(c => `${inlineCode(c)}`).join(" ")} ${project.environment.map(c => `${inlineCode(c)}`).join(" ")}`)
        }

        container.addSeparator(SeparatorSpacingSize.Small, false);

        const nonReleaseRemoved = project.game_versions.filter(v => nonReleaseVersions.some(nv => nv.version === v));
        let filteredVersions = project.game_versions.filter(v => !nonReleaseVersions.some(nv => nv.version === v))
        let removedVersions = nonReleaseRemoved.length + (filteredVersions.length - filteredVersions.slice(-10).length);

        if (filteredVersions.length > 3) {
          filteredVersions = filteredVersions.slice(-10);
        } else removedVersions = 0;

        const versions = await Promise.all((project.game_versions.length > 3 ? filteredVersions : project.game_versions).map(async v => {
          const ver = (await apiClient.Versions().listProjectVersions(projectId)).data.filter(vv => vv.game_versions.includes(v))[0];
          return `[\`${v}\`](<https://modrinth.com/${project.project_type}/${project.id}/version/${ver.version_number}>)`
        }))

        container.addTextDisplay(`### Supported Version${(project.game_versions.length > 3 ? filteredVersions : project.game_versions).length === 1 ? "" : "s"}\n${versions.join(" ")}${project.game_versions.length === 0 ? "\n*Unknown*" : ""}${removedVersions > 0 ? `\n*+${removedVersions} more...${nonReleaseVersions.filter(nv => nonReleaseRemoved.includes(nv.version)).length > 0 ? ` (${nonReleaseVersions.filter(nv => nonReleaseRemoved.includes(nv.version)).length} beta/snapshot)` : ""}*` : ""}`)

        const loaders = await Promise.all(project.loaders.map(async l => {
          return `${await appEmoji(`loader_${l}`)} **${l}**`
        }));

        container.addTextDisplay(`### Loader${project.loaders.length === 1 ? "" : "s"}\n${loaders.join(" – ")}`)

        container.addSeparator();

        if(project.license && project.license.name !== "") container.addTextDisplay(`- **License**: ${project.license.url ? `[${project.license.name && project.license.name.trim() !== "" ? project.license.name : project.license.id}](${project.license.url})` : project.license.name}`)
        container.addTextDisplay(`- **Published**: ${timestamp(publishedDate, "R")}`)
        container.addTextDisplay(`\`📩 ${project.downloads === 0 ? "No" : formatCompactNumber(project.downloads)} ${project.project_type === ProjectTypes.MODPACK ? "Modpack " : ""}Download${project.downloads === 1 ? "" : "s"}\` \`💖 ${project.followers === 0 ? "No" : formatCompactNumber(project.followers)} Follower${project.followers === 1 ? "" : "s"}\``)

        if (hasUrls) {
          container.addSeparator();

          if (Object.entries(urls).length > 0) {
            container.addTextDisplay(`### Project URLs`);
            container.addButtonActionRow(Object.entries(urls).map((k) => RinthComponentBuilder.accessoryButton(ButtonStyle.Link, k[0], k[1])))
          }
          container.addSeparator(SeparatorSpacingSize.Small, false);
          if (Object.entries(donationUrls).length > 0) {
            container.addTextDisplay(`### Donate to ${project.title}`);
            container.addButtonActionRow(Object.entries(donationUrls).map((k) => RinthComponentBuilder.accessoryButton(ButtonStyle.Link, k[0], k[1])))
          }
        }

        let actionRow: ButtonBuilder[] = [];

        if (teamMembers.length - (project.organization ? 1 : 2) > 0) {
          actionRow.push(RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "View All Authors", null, {name: "👥"}, parseCustomId(createCustomId({interactionId: interaction.id, action: "authors", command: project.id, subcommand: "search"}))));
        }

        if (removedVersions > 0) {
          actionRow.push(RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "View All Versions", null, {name: "📊"}, parseCustomId(createCustomId({interactionId: interaction.id, action: "versions", command: project.id, subcommand: "search"}))));
        }

        if (project.gallery.length > 0) {
          actionRow.push(RinthComponentBuilder.accessoryButton(ButtonStyle.Primary, "View Gallery", null, {name: "🖼️"}, parseCustomId(createCustomId({interactionId: interaction.id, action: "gallery", command: project.id, subcommand: "search"}))));
        }

        if (actionRow.length > 0) {
          container.addSeparator();
          container.addButtonActionRow(actionRow);
        }

        await interaction.editReply({components: [container.buildContainer()], flags: [MessageFlags.IsComponentsV2]});


        break;
      }
      case "stop_tracking": {
        const projectId = interaction.options.getString("project", true);
        let res = await apiClient.Projects().getProject(projectId);
        if (res.error) return reply(interaction, RinthComponentBuilder.errorContainer(false, `${res.error.status} ${res.error.message}`), true);
        if(!interaction.memberPermissions.has(PermissionFlagsBits.ManageWebhooks)) return reply(interaction, RinthComponentBuilder.errorContainer(false, `You don't have permission to do that.`), true);


        const project = res.data;
        const dbTrackedProject = DB.Guilds.getAllTrackedProjects().find(tp => tp.project_id === project.id && tp.guild_id === interaction.guildId);

        if(!dbTrackedProject) return reply(interaction, RinthComponentBuilder.errorContainer(false, `\`${project.title}\` is not being tracked.`), true);

        await interaction.deferReply({flags: [MessageFlags.Ephemeral]});

        try {
          const confirmed = new RinthComponentBuilder().setAccentColor(config.brand_color);
          confirmed.addTextDisplay(`### Stopping tracking updates for \`${project.title} [${dbTrackedProject.loader} v${dbTrackedProject.game_version}]\` to ${channelMention(dbTrackedProject.channel_id)}`);

          DB.Guilds.deleteTrackedProject(dbTrackedProject.project_id, dbTrackedProject.guild_id);
          await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [confirmed.buildContainer()] })
          await sendTrackingOutro(dbTrackedProject.loader, dbTrackedProject.game_version, project, await interaction.guild.channels.fetch(dbTrackedProject.channel_id) as TextChannel);
        } catch (er) {
          await interaction.editReply({flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(false, "Failed to stop tracking project").buildContainer()]})
        }

        break;
      }
      case "track": {
        const projectId = interaction.options.getString("query", true);
        const gameVersion = interaction.options.getString("game_version", true);
        const sendFirstVersion = interaction.options.getBoolean("send_initial_version", false) || false;

        let loader = null;
        let channel: TextChannel | null = null;
        let res = await apiClient.Projects().getProject(projectId);
        if (res.error) return reply(interaction, RinthComponentBuilder.errorContainer(false, `${res.error.status} ${res.error.message}`), true);
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageWebhooks)) return reply(interaction, RinthComponentBuilder.errorContainer(false, `You don't have permission to do that.`), true);

        const preTracked = DB.Guilds.getAllTrackedProjects().find(tp => tp.guild_id === interaction.guildId && tp.project_id === res.data.id);
        if(preTracked) return reply(interaction, RinthComponentBuilder.errorContainer(false, `\`${res.data.title}\` is already being tracked (${preTracked.loader} v${preTracked.game_version})`), true);

        const response = await interaction.deferReply({flags: [MessageFlags.Ephemeral], withResponse: true});

        const project = res.data;
        const icon = project?.icon_url || config.images.icon;
        const color = await avgColor(icon);

        const allLoaders = (await apiClient.Tags().getLoaders()).data;
        const loaderOptions = await Promise.all(allLoaders.filter(l => project.loaders.includes(l.name)).map(async l => {
          return { label: l.name, value: l.name, emoji: { id: (await appEmoji(`loader_${l.name}`)).id } };
        }))

        async function confirmContainer(game_version: string | null = null): Promise<RinthComponentBuilder> {
          if (!game_version) game_version = project.game_versions[project.game_versions.length - 1];
          if (!loader) loader = project.loaders[0];
          const container = new RinthComponentBuilder().setAccentColor(color);

          container.addThumbnailAccessorySection(`## Tracking Setup - ${project.title}\n**Selected Loader**: ${loader ? `${await appEmoji(`loader_${loader}`)} ${loader}` : "None"}\n**Selected Game Version**: ${game_version ? `\`${game_version}\`` : "None"}\n**Selected Channel**: ${channel ? `${channelMention(channel.id)}` : "None"}`, icon);

          container.addSeparator();

          container.addTextDisplay(`### ${loader ? `${loader} Selected` : "Select a Loader"}`)
          container.addStringSelectMenu(parseCustomId(generateCustomId(interaction, "select-loader")), loader ? `${loader} Selected` : "Select a Loader", loaderOptions, false, 1, 1);

          if (loader) {
            container.addTextDisplay(`### ${channel ? `#${channel.name} Selected` : "Select a Channel"}`)
            container.addChannelSelectMenu(parseCustomId(generateCustomId(interaction, "select-channel")), channel ? `#${channel.name} Selected` : "Select a Channel", [ChannelType.GuildText, ChannelType.GuildAnnouncement], [], false, 1, 1);
          }

          if (channel) {
            container.addSeparator();
            container.addTextDisplay(`### Track \`${project.title}\` updates for \`${loader} v${gameVersion}\`?`);
            container.addSeparator(SeparatorSpacingSize.Small, false);
            container.addButtonActionRow([
              RinthComponentBuilder.accessoryButton(ButtonStyle.Success, "Start Tracking", null, null, parseCustomId(generateCustomId(interaction, "confirm"))),
              RinthComponentBuilder.accessoryButton(ButtonStyle.Danger, "Cancel", null, null, parseCustomId(generateCustomId(interaction, "cancel")))
            ])
          }


          return container;
        }

        await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [(await confirmContainer(gameVersion)).buildContainer()] })

        const stringSelectCollector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.StringSelect });
        const channelSelectCollector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.ChannelSelect });
        const buttonCollector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.Button });

        stringSelectCollector.on("collect", async select => {
          await select.deferUpdate();
          if (select.customId.includes("select-loader")) {
            loader = select.values[0];
            await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [(await confirmContainer(gameVersion)).buildContainer()] })
          }
        })

        channelSelectCollector.on("collect", async select => {
          await select.deferUpdate();
          if (select.customId.includes("select-channel")) {
            channel = select.guild.channels.cache.get(select.values[0]) as TextChannel || null;
            await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [(await confirmContainer(gameVersion)).buildContainer()] })
          }
        })

        buttonCollector.on("collect", async button => {
          await button.deferUpdate();
          if (button.customId.includes("cancel")) {
            await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [RinthComponentBuilder.errorContainer(true).buildContainer()] })
          }
          if (button.customId.includes("confirm")) {
            const confirmed = new RinthComponentBuilder().setAccentColor(config.brand_color);
            confirmed.addTextDisplay(`### Confirmed!\nSending tracking updates for \`${project.title} [${loader} v${gameVersion}]\` to ${channelMention(channel.id)}`);

            const latestVersion = await getLatestProjectVersion(project.id, gameVersion, loader);

            await sendTrackingIntro(loader, gameVersion, project, channel);
            let newPr = DB.Guilds.createTrackedProject({ channel_id: channel.id, game_version: gameVersion, guild_id: interaction.guild.id, last_update: Date.now(), loader, project_id: project.id, last_version: sendFirstVersion ? "dummy" : latestVersion.id });
            if(sendFirstVersion) await sendTrackedProjectUpdate(project, newPr, channel, latestVersion, true)
            await interaction.editReply({ flags: [MessageFlags.IsComponentsV2], components: [confirmed.buildContainer()] })
          }
        })

        break;
      }
    }
  }
}

export default ProjectsCommand;
