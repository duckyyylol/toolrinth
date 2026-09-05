import { Guild } from "discord.js"
import { DB } from "../db/DB"

export default {
  enabled: true,
  run: async (guild: Guild) => {
    if (!DB.Guilds.getGuild(guild.id)) {
      DB.Guilds.createGuild({ id: guild.id });
    }
  }
}
