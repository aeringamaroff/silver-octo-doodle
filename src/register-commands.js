import { REST, Routes, ApplicationCommandOptionType } from "discord.js";
import "dotenv/config";

const commands = [
  {
    name: "get-status",
    description: "Fetches the server status and current player count",
  },
  {
    name: "respond-test",
    description: "Responds to user",
  },
  {
    name: "connect",
    description: "Gets the IP address of the server from the user",
    options: [
      {
        name: "ip-address",
        description: "server IP address",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("Registering commands ... ");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("Commands registered successfully");
  } catch (error) {
    console.error("ERROR", error);
  }
})();
