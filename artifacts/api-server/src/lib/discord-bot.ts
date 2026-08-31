import {
  closeQueue,
  getState,
  joinQueue,
  nextTicket,
  openQueue,
  setupServer,
  skipTicket,
  submitResult,
  verifyAccount,
  KITS,
  TIERS,
} from "./nexus";
import { logger } from "./logger";

type GatewaySocket = {
  addEventListener: (type: string, listener: (event: { data: string }) => void) => void;
  send: (data: string) => void;
  close: () => void;
};
type DiscordOption = { name: string; value?: string; type?: number };
type DiscordInteraction = {
  id: string;
  token: string;
  guild_id?: string;
  member?: { user?: { id: string; username: string }; roles?: string[]; permissions?: string };
  user?: { id: string; username: string };
  data?: { name?: string; options?: DiscordOption[] };
};

const rest = (path: string, init: RequestInit = {}) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  return fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
};

async function createTicketChannel(
  guildId: string,
  kit: string,
  playerUsername: string,
  testerUsername: string,
) {
  const safePlayer = playerUsername.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 24);
  const response = await rest(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: `ticket-${kit}-${safePlayer}`,
      type: 0,
      topic: `NexusTiers ${kit} ticket • player ${playerUsername} • tester ${testerUsername}`,
    }),
  });
  if (!response.ok) throw new Error(`Could not create ticket channel: ${response.status}`);
  return (await response.json()) as { id: string; name: string };
}

async function findChannel(guildId: string, name: string) {
  const response = await rest(`/guilds/${guildId}/channels`);
  if (!response.ok) return null;
  const channels = (await response.json()) as Array<{ id: string; name: string }>;
  return channels.find((channel) => channel.name === name) ?? null;
}

async function postToChannel(channelId: string, content: string) {
  await rest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

function option(interaction: DiscordInteraction, name: string) {
  return interaction.data?.options?.find((item) => item.name === name)?.value;
}

function actor(interaction: DiscordInteraction) {
  return interaction.member?.user ?? interaction.user ?? { id: "unknown", username: "Discord user" };
}

function hasTesterPermission(interaction: DiscordInteraction) {
  const permissions = BigInt(interaction.member?.permissions ?? "0");
  const administrator = (permissions & 0x8n) === 0x8n;
  const configuredRole = process.env.DISCORD_TESTER_ROLE_ID;
  const hasRole = Boolean(configuredRole && interaction.member?.roles?.includes(configuredRole));
  return administrator || hasRole;
}

async function respond(interaction: DiscordInteraction, content: string, ephemeral = false) {
  await rest(`/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: "POST",
    body: JSON.stringify({
      type: 4,
      data: { content, flags: ephemeral ? 64 : 0 },
    }),
  });
}

async function registerCommands(applicationId: string) {
  const commands = [
    {
      name: "open",
      description: "Öffnet eine NexusTiers Queue",
      options: [{ name: "kit", description: "Kit", type: 3, required: true, choices: KITS.map((kit) => ({ name: kit, value: kit })) }],
    },
    {
      name: "close",
      description: "Schließt eine NexusTiers Queue",
      options: [{ name: "kit", description: "Kit", type: 3, required: true, choices: KITS.map((kit) => ({ name: kit, value: kit })) }],
    },
    {
      name: "next",
      description: "Öffnet das nächste Tester-Ticket",
      options: [{ name: "kit", description: "Kit", type: 3, required: true, choices: KITS.map((kit) => ({ name: kit, value: kit })) }],
    },
    {
      name: "skip",
      description: "Überspringt das aktuelle Ticket",
      options: [{ name: "kit", description: "Kit", type: 3, required: true, choices: KITS.map((kit) => ({ name: kit, value: kit })) }],
    },
    {
      name: "result",
      description: "Speichert das Ergebnis des aktuellen Tickets",
      options: [
        { name: "kit", description: "Kit", type: 3, required: true, choices: KITS.map((kit) => ({ name: kit, value: kit })) },
        { name: "tier", description: "Neues Tier", type: 3, required: true, choices: TIERS.map((tier) => ({ name: tier, value: tier })) },
      ],
    },
    {
      name: "verify",
      description: "Verifiziert deinen Minecraft-Account",
      options: [{ name: "ign", description: "Minecraft IGN", type: 3, required: true }],
    },
    {
      name: "enter",
      description: "Trägt dich in eine Kit-Warteliste ein",
      options: [
        { name: "kit", description: "Kit", type: 3, required: true, choices: KITS.map((kit) => ({ name: kit, value: kit })) },
        { name: "ign", description: "Minecraft IGN", type: 3, required: true },
        { name: "tier", description: "Aktuelles Tier", type: 3, required: true, choices: TIERS.map((tier) => ({ name: tier, value: tier })) },
        { name: "region", description: "Region", type: 3, required: true },
        { name: "server", description: "Server-Adresse", type: 3, required: true },
      ],
    },
    {
      name: "createchannel",
      description: "Erstellt NexusTiers Kanäle und Rollen",
    },
  ];
  const guildId = process.env.DISCORD_GUILD_ID;
  const path = guildId
    ? `/applications/${applicationId}/guilds/${guildId}/commands`
    : `/applications/${applicationId}/commands`;
  const response = await rest(path, { method: "PUT", body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Could not register commands: ${response.status} ${await response.text()}`);
}

async function handleInteraction(interaction: DiscordInteraction) {
  const name = interaction.data?.name;
  const user = actor(interaction);
  try {
    if (["open", "close", "next", "skip", "result", "createchannel"].includes(name ?? "") && !hasTesterPermission(interaction)) {
      await respond(interaction, "Nur der Verified Tester Rank darf diesen Befehl nutzen.", true);
      return;
    }
    if (name === "open") {
      const kit = String(option(interaction, "kit"));
      await openQueue({ actorId: user.id, actorName: user.username }, kit);
      await respond(interaction, `Die **${kit}** Queue ist jetzt offen. Spieler können in #${kit}-waitlist joinen.`);
      return;
    }
    if (name === "close") {
      const kit = String(option(interaction, "kit"));
      await closeQueue({ actorId: user.id, actorName: user.username }, kit);
      await respond(interaction, `Die **${kit}** Queue wurde geschlossen.`);
      return;
    }
    if (name === "next") {
      const kit = String(option(interaction, "kit"));
      const ticket = await nextTicket({ actorId: user.id, actorName: user.username }, kit);
      const ticketChannel = interaction.guild_id
        ? await createTicketChannel(interaction.guild_id, kit, ticket.player.username, ticket.tester.username)
        : null;
      await respond(
        interaction,
        `Ticket geöffnet: **${ticket.player.username}** (#1) mit Tester **${ticket.tester.username}**${ticketChannel ? ` — ${ticketChannel.name}` : ""}.`,
      );
      if (ticketChannel) {
        await postToChannel(
          ticketChannel.id,
          `**NexusTiers Ticket**\nSpieler: <@${ticket.player.discordUserId}> (${ticket.player.ign})\nTester: <@${ticket.tester.discordUserId}>\nKit: **${kit}**\nAktuelles Tier: **${ticket.player.currentTier || "N/A"}**\nWenn fertig: \`/result\` • Wenn der Spieler nicht erscheint: \`/skip\``,
        );
      }
      return;
    }
    if (name === "skip") {
      const kit = String(option(interaction, "kit"));
      const state = await getState();
      const current = state.queues[kit as keyof typeof state.queues]?.currentTicket;
      await skipTicket({ actorId: user.id, actorName: user.username }, kit);
      if (interaction.guild_id && current) {
        const channel = await findChannel(interaction.guild_id, `ticket-${kit}-${current.player.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 24)}`);
        if (channel) await postToChannel(channel.id, "Ticket übersprungen. Dieser Kanal kann jetzt archiviert werden.");
      }
      await respond(interaction, `Ticket in **${kit}** übersprungen. Die Queue wurde nach vorne geschoben.`);
      return;
    }
    if (name === "verify") {
      const ign = String(option(interaction, "ign"));
      const account = await verifyAccount({ discordUserId: user.id, username: user.username, ign });
      await respond(interaction, `Account **${account.ign}** ist verifiziert. Du kannst jetzt mit \`/enter\` einer Queue beitreten.`);
      return;
    }
    if (name === "enter") {
      const kit = String(option(interaction, "kit"));
      const state = await getState();
      const verified = state.verified.find((item) => item.discordUserId === user.id);
      const ign = String(option(interaction, "ign"));
      const entry = await joinQueue(
        {
          discordUserId: user.id,
          username: user.username,
          ign: verified?.ign ?? ign,
          currentTier: String(option(interaction, "tier")),
          region: String(option(interaction, "region")),
          server: String(option(interaction, "server")),
        },
        kit,
      );
      await respond(interaction, `Du bist in **${kit}** auf Position **${entry.position}**. Sieh in #${kit}-waitlist nach.`);
      return;
    }
    if (name === "result") {
      const kit = String(option(interaction, "kit"));
      const tier = String(option(interaction, "tier"));
      const state = await getState();
      const ticket = state.queues[kit as keyof typeof state.queues]?.currentTicket;
      if (!ticket) throw new Error("Für dieses Kit ist kein Ticket offen.");
      const result = await submitResult({
        playerDiscordUserId: ticket.player.discordUserId,
        playerUsername: ticket.player.username,
        ign: ticket.player.ign,
        kit,
        tier,
        testerId: user.id,
        testerName: user.username,
        previousTier: ticket.player.currentTier || "N/A",
        region: ticket.player.region,
      });
      if (interaction.guild_id) {
        const resultsChannel = await findChannel(interaction.guild_id, "results");
        if (resultsChannel) {
          await postToChannel(
            resultsChannel.id,
            `**${result.playerUsername}'s Test Results**\nTester: <@${user.id}>\nRegion: ${result.region ?? "N/A"}\nUsername: ${result.ign}\nPrevious Rank: ${result.previousTier || "N/A"}\nRank Earned: **${result.tier}**\n<@${result.playerDiscordUserId}>`,
          );
        }
      }
      await respond(interaction, `Ergebnis gespeichert: **${result.ign}** erhält **${result.tier}** in **${kit}**. Der Spieler und der Tester werden im Result-Post markiert.`);
      return;
    }
    if (name === "createchannel") {
      if (!interaction.guild_id) throw new Error("Dieser Befehl funktioniert nur auf einem Server.");
      const setup = await setupServer({ guildId: interaction.guild_id, actorId: user.id });
      await respond(interaction, setup.message);
      return;
    }
    await respond(interaction, "Unbekannter NexusTiers-Befehl.", true);
  } catch (error) {
    await respond(interaction, error instanceof Error ? error.message : "Befehl fehlgeschlagen.", true);
  }
}

export function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN is missing; Discord bot gateway is disabled.");
    return;
  }
  const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => GatewaySocket }).WebSocket;
  if (!WebSocketCtor) {
    logger.warn("WebSocket is unavailable; Discord bot gateway is disabled.");
    return;
  }
  const socket = new WebSocketCtor("wss://gateway.discord.gg/?v=10&encoding=json");
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data) as {
      op: number;
      d: { heartbeat_interval?: number; user?: { id: string } } & DiscordInteraction;
    };
    if (payload.op === 10) {
      const interval = payload.d.heartbeat_interval ?? 41250;
      setInterval(() => socket.send(JSON.stringify({ op: 1, d: null })), interval);
      socket.send(JSON.stringify({ op: 2, d: { token, intents: 1, properties: { os: "linux", browser: "NexusTiers", device: "NexusTiers" } } }));
    }
    if (payload.op === 0 && (payload.d as { t?: string }).t === "READY") {
      const applicationId = payload.d.user?.id;
      if (applicationId) {
        registerCommands(applicationId).then(
          () => logger.info({ applicationId }, "NexusTiers slash commands registered"),
          (error) => logger.error({ error }, "Could not register NexusTiers slash commands"),
        );
      }
    }
    if (payload.op === 0 && (payload.d as { t?: string }).t === "INTERACTION_CREATE") {
      void handleInteraction(payload.d);
    }
  });
  logger.info("NexusTiers Discord gateway started");
}