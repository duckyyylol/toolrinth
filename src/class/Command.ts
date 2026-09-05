import {
    ChatInputApplicationCommandData,
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    ApplicationCommandOptionData,
} from "discord.js";

type BetterCommandOption = ApplicationCommandOptionData;

interface CommandAddons {
    enabled: boolean;
    helpDescription?: string;
    options?: BetterCommandOption[];
    run: (interaction: ChatInputCommandInteraction) => void;
    autocomplete?: (interaction: AutocompleteInteraction) => void;
}

type BetterCommand = Pick<ChatInputApplicationCommandData, Exclude<keyof ChatInputApplicationCommandData, "options">> & CommandAddons;

export interface Command extends BetterCommand { }
