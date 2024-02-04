import { Client, IntentsBitField, ActivityType } from "discord.js";
import "dotenv/config";

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

client.on("ready", (c) => {
  console.log(`${c.user.username} IS ONLINE`);
});

client.on("interactionCreate", (interaction) => {
  if (!interaction.isChatInputCommand) return;

  if (interaction.commandName === "respond-test") {
    interaction.reply("Responding to the command!");
  }

  if (interaction.commandName === "get-status") {
    interaction.reply("Fetching server data!");
  }

  if (interaction.commandName === "connect") {
    const ip = interaction.options.get("ip-address");

    // TODO: validate IP address

    interaction.reply(`Connecting to ${ip?.value} ...`);
  }
});

client.on("ready", (c) => {
  client.user.setActivity({
    name: "Server",
    type: ActivityType.Listening,
  });
});

client.login(process.env.TOKEN);
