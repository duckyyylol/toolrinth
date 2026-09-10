import { Guild } from "discord.js"
import { DB } from "../db/DB"
import { ContextTypes } from "../types";

export default {
  enabled: true,
  run: async (guild: Guild) => {
    if (guild) {
      if (!DB.Contexts.getContext(guild.id)) {
        DB.Contexts.createContext({ id: guild.id, type: ContextTypes.GUILD });
      }
    }
  }
}
