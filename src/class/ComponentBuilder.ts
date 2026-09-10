import {
  ActionRowBuilder,
  APIActionRowComponent,
  APIMessageComponentEmoji,
  APISelectMenuOption,
  Attachment,
  AttachmentBuilder,
  BaseSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  Colors,
  ComponentBuilder,
  ContainerBuilder,
  ContainerComponentBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MediaGalleryItemData,
  MentionableSelectMenuBuilder,
  PartialEmoji,
  RGBTuple,
  Role,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SelectMenuType,
  SeparatorBuilder,
  SeparatorSpacingSize,
  Snowflake,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  UnfurledMediaItem,
  UnfurledMediaItemData,
} from "discord.js";
import {
  createCustomId,
  generateCustomId,
  parseCustomId,
  InteractionInfo,
} from "../util";
import config from "../constants";
import { client } from "..";

export class RinthComponentBuilder {
  container: ContainerBuilder;

  constructor(p_container?: ContainerBuilder) {
    if (!p_container) p_container = new ContainerBuilder();
    this.container = p_container;
  }

  // static buttonActionRow(id?: number): ActionRowBuilder<ButtonBuilder> {
  //     const row: ActionRowBuilder<ButtonBuilder> = new ActionRowBuilder<ButtonBuilder>()
  //     if(id) row.setId(id);

  //     return row;
  // }

  static actionRow(id?: number): ActionRowBuilder<any> {
    const row: ActionRowBuilder<any> = new ActionRowBuilder<any>();
    if (id) row.setId(id);

    return row;
  }

  static section(id?: number): SectionBuilder {
    const sec = new SectionBuilder();
    if (id) sec.setId(id);
    return sec;
  }

  static textDisplay(content: string, id?: number): TextDisplayBuilder {
    const text = new TextDisplayBuilder();
    text.setContent(content);
    if (id) text.setId(id);

    return text;
  }

  static separator(
    spacing?: SeparatorSpacingSize,
    showDivider?: boolean,
    id?: number,
  ): SeparatorBuilder {
    const sep = new SeparatorBuilder();
    sep.setSpacing(spacing ? spacing : SeparatorSpacingSize.Large);
    sep.setDivider(showDivider);
    if (id) sep.setId(id);

    return sep;
  }

  static selectMenu(
    type: "String" | "Mentionable" | "Role" | "Channel",
    custom_id: InteractionInfo,
    placeholder_text: string,
    disabled: boolean = false,
    min: number = 0,
    max: number = 1,
  ): BaseSelectMenuBuilder<any> {
    let select: BaseSelectMenuBuilder<any>;
    switch (type) {
      case "String": {
        select = new StringSelectMenuBuilder();
        select
          .setCustomId(createCustomId(custom_id))
          .setPlaceholder(placeholder_text)
          .setMaxValues(max)
          .setMinValues(min)
          .setDisabled(disabled);
        return select as StringSelectMenuBuilder;
      }
      case "Channel": {
        select = new ChannelSelectMenuBuilder();
        select
          .setCustomId(createCustomId(custom_id))
          .setPlaceholder(placeholder_text)
          .setMaxValues(max)
          .setMinValues(min)
          .setDisabled(disabled);
        return select as ChannelSelectMenuBuilder;
      }
      case "Role": {
        select = new RoleSelectMenuBuilder();
        select
          .setCustomId(createCustomId(custom_id))
          .setPlaceholder(placeholder_text)
          .setMaxValues(max)
          .setMinValues(min)
          .setDisabled(disabled);
        return select as RoleSelectMenuBuilder;
      }
      case "Mentionable": {
        select = new MentionableSelectMenuBuilder();
        select
          .setCustomId(createCustomId(custom_id))
          .setPlaceholder(placeholder_text)
          .setMaxValues(max)
          .setMinValues(min)
          .setDisabled(disabled);
        return select as MentionableSelectMenuBuilder;
      }

      default: {
        select = null;
        //wtf happened??
      }
    }

    if (select == null) throw new Error("Oh boy, what did you do this time?");
  }

  static accessoryButton(
    type: ButtonStyle,
    button_label: string,
    button_url?: string,
    button_emoji?: APIMessageComponentEmoji,
    custom_id?: InteractionInfo,
    use_existing_button?: ButtonBuilder,
  ): ButtonBuilder {
    let but: ButtonBuilder = new ButtonBuilder().setLabel(button_label);
    if (type === ButtonStyle.Link) {
      // link button
      try {
        new URL(button_url);
        but.setStyle(type);
        but.setURL(button_url);

        return but;
      } catch (_a) {
        throw new Error("BAD URL - BUTTON BUILDER");
      }
    } else {
      if (button_emoji || button_emoji !== null) but.setEmoji(button_emoji);
      if (custom_id) {
        but.setCustomId(createCustomId(custom_id));
      } else {
        but.setCustomId(
          createCustomId({
            action: "accessory-button",
            interactionId: Date.now().toString(),
          }),
        );
      }
      but.setStyle(type);

      return but;
    }
  }

  static mediaGalleryItem(
    media: MediaGalleryItemData,
  ): MediaGalleryItemBuilder {
    const item = new MediaGalleryItemBuilder().setURL(media.media.url);

    return item;
  }

  static mediaGallery(
    media: MediaGalleryItemData[],
    id?: number,
  ): MediaGalleryBuilder {
    const med = new MediaGalleryBuilder();
    if (id) med.setId(id);

    med.addItems(media.map((m) => RinthComponentBuilder.mediaGalleryItem(m)));

    return med;
  }

  static fileItem(file_url: string, id?: number): FileBuilder {
    const file = new FileBuilder();
    if (id) file.setId(id);
    try {
      new URL(file_url);
      file.setURL(file_url);

      return file;
    } catch (er) {
      throw new Error("BAD URL! - FILEBUILDER");
    }
  }

  static errorContainer(
    cancelled: boolean = false,
    error: string | null = null,
  ): RinthComponentBuilder {
    return new RinthComponentBuilder()
      .setAccentColor(Colors.Red)
      .addTextDisplay(
        `${error ? `## An Error Occurred\n${error}` : `## Interaction ${cancelled ? "Cancelled" : "Expired\nThis interaction has expired. Please run the command again."}`}`,
      );
  }

  addStringSelectMenu(
    custom_id: InteractionInfo,
    placeholder_text: string,
    options: APISelectMenuOption[],
    disabled: boolean = false,
    min: number = 0,
    max: number = 1,
  ) {
    const select: StringSelectMenuBuilder = RinthComponentBuilder.selectMenu(
      "String",
      custom_id,
      placeholder_text,
      disabled,
      min,
      max,
    ) as StringSelectMenuBuilder;
    select.addOptions(options);
    const row = RinthComponentBuilder.actionRow().addComponents([select]);
    this.container.addActionRowComponents(row);

    return this;
  }

  addRoleSelectMenu(
    custom_id: InteractionInfo,
    placeholder_text: string,
    defaultRoles: Snowflake[] = [],
    disabled: boolean = false,
    min: number = 0,
    max: number = 1,
  ) {
    const select: RoleSelectMenuBuilder = RinthComponentBuilder.selectMenu(
      "Role",
      custom_id,
      placeholder_text,
      disabled,
      min,
      max,
    ) as RoleSelectMenuBuilder;
    select.setDefaultRoles(defaultRoles);
    const row = RinthComponentBuilder.actionRow().addComponents([select]);
    this.container.addActionRowComponents(row);

    return this;
  }

  addChannelSelectMenu(
    custom_id: InteractionInfo,
    placeholder_text: string,
    channelTypes: ChannelType[] = [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildVoice,
    ],
    defaultChannels: Snowflake[] = [],
    disabled: boolean = false,
    min: number = 0,
    max: number = 1,
  ) {
    const select: ChannelSelectMenuBuilder = RinthComponentBuilder.selectMenu(
      "Channel",
      custom_id,
      placeholder_text,
      disabled,
      min,
      max,
    ) as ChannelSelectMenuBuilder;
    select.setChannelTypes(channelTypes);
    select.setDefaultChannels(defaultChannels);

    const row = RinthComponentBuilder.actionRow().addComponents([select]);
    this.container.addActionRowComponents(row);

    return this;
  }

  addMentionableSelectMenu(
    custom_id: InteractionInfo,
    placeholder_text: string,
    defaultRoles: Snowflake[] = [],
    defaultUsers: Snowflake[] = [],
    disabled: boolean = false,
    min: number = 0,
    max: number = 1,
  ) {
    const select: MentionableSelectMenuBuilder = RinthComponentBuilder.selectMenu(
      "Mentionable",
      custom_id,
      placeholder_text,
      disabled,
      min,
      max,
    ) as MentionableSelectMenuBuilder;
    select.addDefaultRoles(defaultRoles);
    select.addDefaultUsers(defaultUsers);

    const row = RinthComponentBuilder.actionRow().addComponents([select]);
    this.container.addActionRowComponents(row);

    return this;
  }

  addButtonActionRow(
    components: ButtonBuilder[],
    id?: number,
  ): RinthComponentBuilder {
    let row = RinthComponentBuilder.actionRow();
    if (id) row.setId(id);
    row.setComponents(components.filter((c) => c !== null));

    this.container.addActionRowComponents(row);

    return this;
  }

  setAccentColor(color: RGBTuple | number): RinthComponentBuilder {
    if (color === config.brand_color && client.user.id === config.canary_client_id) color = config.brand_color_canary;
    this.container.setAccentColor(color);
    return this;
  }

  addSeparator(
    spacing: SeparatorSpacingSize = SeparatorSpacingSize.Large,
    showDivider: boolean = true,
    id?: number,
  ): RinthComponentBuilder {
    const sep = RinthComponentBuilder.separator(spacing, showDivider);
    if (id) sep.setId(id);
    this.container.addSeparatorComponents(sep);
    return this;
  }

  addTextDisplay(content: string, id?: number): RinthComponentBuilder {
    const text = RinthComponentBuilder.textDisplay(content);
    if (id) text.setId(id);

    this.container.addTextDisplayComponents(text);

    return this;
  }

  addLinkButtonAccessorySection(
    content: string,
    button_label: string,
    button_url: string,
  ): RinthComponentBuilder {
    const sec = RinthComponentBuilder.section()
      .addTextDisplayComponents(RinthComponentBuilder.textDisplay(content))
      .setButtonAccessory(
        RinthComponentBuilder.accessoryButton(
          ButtonStyle.Link,
          button_label,
          button_url,
        ),
      );
    this.container.addSectionComponents(sec);

    return this;
  }

  addButtonAccessorySection(
    content: string,
    button_style: ButtonStyle,
    button_label: string,
    custom_id: InteractionInfo,
    button_emoji?: APIMessageComponentEmoji,
    use_existing_button?: ButtonBuilder,
  ): RinthComponentBuilder {
    if (button_style === ButtonStyle.Link && !use_existing_button)
      return this.addLinkButtonAccessorySection(
        content,
        button_label,
        "https://example.com",
      );
    const sec = RinthComponentBuilder.section().addTextDisplayComponents(
      RinthComponentBuilder.textDisplay(content),
    );
    if (use_existing_button) {
      sec.setButtonAccessory(use_existing_button);
      this.container.addSectionComponents(sec);
      return this;
    }
    const but = RinthComponentBuilder.accessoryButton(
      button_style,
      button_label,
      null,
      null,
      custom_id,
    );
    if (button_emoji && (button_emoji.id || button_emoji.name))
      but.setEmoji(button_emoji);
    sec.setButtonAccessory(but);
    this.container.addSectionComponents(sec);

    return this;
  }

  addThumbnailAccessorySection(
    content: string,
    thumbnail_url: string,
    thumbnail_attachment?: AttachmentBuilder,
    id?: number,
  ): RinthComponentBuilder {
    const sec = new SectionBuilder().addTextDisplayComponents(
      RinthComponentBuilder.textDisplay(content),
    );
    if (id) sec.setId(id);

    const thumbnail = new ThumbnailBuilder();
    if (!thumbnail_attachment) {
      try {
        new URL(thumbnail_url);

        thumbnail.setURL(thumbnail_url);
      } catch (_a) {
        throw new Error("BAD URL STUPID MF");
      }
    }
    if (thumbnail_attachment)
      thumbnail.setURL(`attachment://${thumbnail_attachment.name}`);

    sec.setThumbnailAccessory(thumbnail);
    this.container.addSectionComponents(sec);

    return this;
  }

  addMediaGallery(
    media: MediaGalleryItemData[],
    id?: number,
  ): RinthComponentBuilder {
    const med = RinthComponentBuilder.mediaGallery(media);
    if (id) med.setId(id);

    this.container.addMediaGalleryComponents(med);
    return this;
  }

  // MUST UPLOAD THE FILE IN message.files AS WELL TO APPEAR IN CONTAINER!!!!!!!!!!!
  addFile(file_url_or_attachment?: string | Attachment): RinthComponentBuilder {
    let file: FileBuilder = null;
    if (typeof file_url_or_attachment === "string") {
      file = RinthComponentBuilder.fileItem(file_url_or_attachment);
      this.container.addFileComponents(file);
      return this;
    } else if (file_url_or_attachment.name !== null) {
      file = RinthComponentBuilder.fileItem(
        `attachment://${file_url_or_attachment.name}`,
      );
      this.container.addFileComponents(file);
      return this;
    }
  }

  addHeadingWithSeparator(
    content: string,
    headingSize: number,
    spacing: SeparatorSpacingSize = SeparatorSpacingSize.Large,
    showDivider: boolean = true,
  ): RinthComponentBuilder {
    if (!content)
      throw new Error(
        "Invalid Content Provided - ComponentBuilder#addHeadingWithSeparator",
      );
    let newLines = content.split(/\\n/gim);
    if (newLines.length > 1) {
      content = `${"#".repeat(headingSize)} ${newLines[0]}${newLines.length > 1 ? "\n" : ""}${newLines.filter((s) => s !== newLines[0]).join("\n")}`;
    } else {
      content = `${"#".repeat(headingSize)} ${content}`;
    }
    this.container.addTextDisplayComponents(
      RinthComponentBuilder.textDisplay(content),
    );
    this.container.addSeparatorComponents((sep) =>
      sep.setSpacing(spacing).setDivider(showDivider),
    );

    return this;
  }

  buildContainer(): ContainerBuilder {
    return this.container;
  }
}
