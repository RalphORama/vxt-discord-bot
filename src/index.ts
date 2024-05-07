import dotenv from "dotenv";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { Commands } from "./commands";
import { replacements } from "./replacements";
import { CustomCommand } from "./@types/CustomCommand";

dotenv.config();

const replacementsEntries = Object.entries(replacements);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection<string, CustomCommand>();

for (const cmd of Commands) {
  client.commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, (eventClient) => {
  client.user?.setActivity("/help");

  console.log(`[Events.ClientReady]\tLogged in as ${eventClient.user.tag}.`);

  const guildCount = eventClient.guilds.cache.size;
  console.log(
    `[Events.ClientReady]\tPresent in ${guildCount} ${guildCount === 1 ? "guild" : "guilds"}.`,
  );
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = <CustomCommand>interaction.client.commands.get(interaction.commandName);
  await command.execute(interaction);
});

client.on(Events.MessageCreate, (message) => {
  // Avoid infinite loops of bots replying to each other
  if (message.author.bot) {
    return;
  }

  let reply = "";
  let isSpoiler = false;

  for (const [identifier, replacer] of replacementsEntries) {
    // no "g" flag because we only need to know if there's one or zero matches
    const regex = RegExp(identifier);

    // split around "no embed" angle-brackets
    const tuples = message.content.split(/(<[^> ]+>)/g).map((part) => {
      let isSpoilerPart = false;

      // if a part starts and ends with angle brackets, it's not to be embedded; ignore it
      if (part.startsWith("<") && part.endsWith(">")) return [null, isSpoilerPart];

      if (!regex.test(part)) return [null, isSpoilerPart];

      // if any part contains spoilers, we should spoiler the reply
      if (part.includes("||")) isSpoilerPart = true;

      // bit ugly but easiest way to get rid of || at the end of spoilered links
      // plus, what's the worst thing that could happen? what kind of URL has
      // "|" in it?    👈 me settin myself up lol
      const replyPart = replacer(part.replaceAll("|", ""));
      if (!replyPart) return [null, isSpoilerPart];

      return [replyPart, isSpoilerPart];
    });

    reply +=
      tuples
        .filter(([replyPart]) => replyPart)
        .map(([replyPart]) => replyPart)
        .join("\n") + "\n";
    isSpoiler ||= tuples.some(([, isSpoilerPart]) => isSpoilerPart);
  }

  if (reply === "") {
    return;
  }

  if (isSpoiler) {
    // Spoiler the message with some padding so the vertical bars don't mess
    // up the end of the URLs
    reply = "||" + reply.replace(/\n$/g, "") + " ||";
  }

  message
    .reply({ content: reply, allowedMentions: { repliedUser: false } })
    .then(() => {
      message.suppressEmbeds(true).catch((err) => {
        const errMsg: string = (err as Error).message;

        if (errMsg.includes("Missing Permissions")) {
          return;
        }

        console.error(
          "[Events.MessageCreate]\tFailed to suppress embeds\t",
          (err as Error).message,
        );
      });
    })
    .catch((err) => {
      const errMsg: string = (err as Error).message;

      if (errMsg.includes("Missing Permissions")) {
        return;
      }

      console.error("[Events.MessageCreate]\tFailed to reply\t", (err as Error).message);
    });
});

void client.login(process.env.DISCORD_BOT_TOKEN);
