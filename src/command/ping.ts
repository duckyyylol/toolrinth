import { Command } from "../class/Command";

const PingCommand: Command = {
  enabled: true,
  name: "ping",
  description: "Ping?",
  run: async interaction => {
    interaction.reply({content: "pong!"})
  }
}

export default PingCommand;
