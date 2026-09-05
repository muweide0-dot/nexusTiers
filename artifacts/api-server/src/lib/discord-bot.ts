import {
  closeQueue,
  clearPlayerTiers,
  getState,
  joinQueue,
  nextTicket,
  openQueue,
  setupServer,
  skipTicket,
  submitResult,
  verifyAccount,
  KITS,
  KIT_LABELS,
  TIERS,
} from "./nexus";
import { logger } from "./logger";

type GatewaySocket = {
  addEventListener: (type: string, listener: (event: { data: string }) => void) => void;
  send: (data: string) => void;
  close: () => void;
};
type DiscordOption = { name: string; value?: string; type?: number; options?: DiscordOption[] };
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

async function deleteAllRoles(guildId: string) {
  const response = await rest(`/guilds/${guildId}/roles`);
  if (!response.ok) throw new Error(`Konnte Discord-Rollen nicht lesen: ${response.status}`);
  const roles = (await response.json()) as Array<{ id: string; name: string; managed?: boolean }>;
  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const role of roles) {
    if (role.id === guildId || role.managed) continue;
    const deleteResponse = await rest(`/guilds/${guildId}/roles/${role.id}`, { method: "DELETE" });
    if (deleteResponse.ok) deleted.push(role.name);
    else skipped.push(role.name);
  }
  return { deleted, skipped };
}

const TIER_ROLE_COLORS: Record<string, number> = {
  lt5: 0x95a5a6,
  ht5: 0x7f8c8d,
  lt4: 0x2ecc71,
  ht4: 0x27ae60,
  lt3: 0x3498db,
  ht3: 0x2980b9,
  lt2: 0x9b59b6,
  ht2: 0x8e44ad,
  lt1: 0xf1c40f,
  ht1: 0xe74c3c,
};

async function createTierRoles(guildId: string) {
  const response = await rest("/guilds/" + guildId + "/roles");
  if (!response.ok) throw new Error("Konnte Discord-Rollen nicht lesen: " + response.status);
  const roles = (await response.json()) as Array<{
    id: string;
    name: string;
    managed?: boolean;
    color?: number;
    hoist?: boolean;
  }> ;
  const desiredRoles = KITS.flatMap((kit) =>
    TIERS.filter((tier) => tier !== "N/A").map((tier) => ({
      name: tier.toUpperCase() + " " + KIT_LABELS[kit],
      color: TIER_ROLE_COLORS[tier],
    })),
  );
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const desired of desiredRoles) {
    const existing = roles.find((role) => role.name.toLowerCase() === desired.name.toLowerCase());
    if (existing) {
      if (existing.managed) {
        skipped.push(desired.name);
        continue;
      }
      if (existing.name !== desired.name || existing.color !== desired.color || existing.hoist !== true) {
        const updateResponse = await rest("/guilds/" + guildId + "/roles/" + existing.id, {
          method: "PATCH",
          body: JSON.stringify({ name: desired.name, color: desired.color, hoist: true, mentionable: false }),
        });
        if (!updateResponse.ok) throw new Error("Konnte Rolle \"" + desired.name + "\" nicht aktualisieren: " + updateResponse.status);
        updated.push(desired.name);
      }
      continue;
    }

    const createResponse = await rest("/guilds/" + guildId + "/roles", {
      method: "POST",
      body: JSON.stringify({ name: desired.name, color: desired.color, hoist: true, mentionable: false }),
    });
    if (!createResponse.ok) throw new Error("Konnte Rolle \"" + desired.name + "\" nicht erstellen: " + createResponse.status);
    created.push(desired.name);
  }

  return { created, updated, skipped, total: desiredRoles.length };
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

function hasManageRolesPermission(interaction: DiscordInteraction) {
  const permissions = BigInt(interaction.member?.permissions ?? "0");
  const administrator = (permissions & 0x8n) === 0x8n;
  const manageRoles = (permissions & 0x10000000n) === 0x10000000n;
  return administrator || manageRoles;
}

function subcommand(interaction: DiscordInteraction) {
  return interaction.data?.options?.find((item) => item.type === 1)?.name;
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
    {
      name: "create",
      description: "Erstellt NexusTiers Tier-Rollen",
      options: [{ name: "role", description: "Erstellt alle farbigen Tier-Rollen", type: 1 }],
    },
    {
      name: "delete",
      description: "Destruktive NexusTiers-Verwaltung",
      options: [
        { name: "role", description: "Löscht alle benutzerdefinierten Rollen", type: 1 },
        { name: "all", description: "Löscht alle benutzerdefinierten Rollen", type: 1 },
      ],
    },
    {
      name: "clear",
      description: "Entfernt alle Website-Tiers eines Users",
      options: [{ name: "user", description: "Discord-User, dessen Tiers entfernt werden", type: 6, required: true }],
    },
  ];
  const guildId = process.env.DISCORD_GUILD_ID;
  const path = guildId
    ? `/applications/${applicationId}/guilds/${guildId}/commands`
    : `/applications/${applicationId}/commands`;
  logger.info({ path, commands: commands.map((command) => command.name) }, "Registering NexusTiers slash commands");
  const response = await rest(path, { method: "PUT", body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Could not register commands: ${response.status} ${await response.text()}`);
}

async function handleInteraction(interaction: DiscordInteraction) {
  const name = interaction.data?.name;
  const user = actor(interaction);
  try {
    if (name === "create") {
      if (subcommand(interaction) !== "role") {
        await respond(interaction, "Nutze den Befehl als \`/create role\`.", true);
        return;
      }
      if (!interaction.guild_id) {
        await respond(interaction, "Dieser Befehl funktioniert nur auf einem Server.", true);
        return;
      }
      if (!hasManageRolesPermission(interaction)) {
        await respond(interaction, "Du brauchst die Berechtigung \`Manage Roles\` für diesen Befehl.", true);
        return;
      }
      const roleResult = await createTierRoles(interaction.guild_id);
      const skippedMessage = roleResult.skipped.length > 0
        ? " " + roleResult.skipped.length + " verwaltete Rollen wurden übersprungen."
        : "";
      await respond(
        interaction,
        "Tier-Rollen fertig: " + roleResult.created.length + " erstellt, " + roleResult.updated.length + " aktualisiert von " + roleResult.total + ". Alle Tier-Rollen sind farbig und separat sichtbar." + skippedMessage,
      );
      return;
    }
    if (name === "delete") {
      if (!interaction.guild_id) {
        await respond(interaction, "Dieser Befehl funktioniert nur auf einem Server.", true);
        return;
      }
      const guildResponse = await rest(`/guilds/${interaction.guild_id}`);
      if (!guildResponse.ok) throw new Error(`Konnte Server-Eigentümer nicht prüfen: ${guildResponse.status}`);
      const guild = (await guildResponse.json()) as { owner_id: string };
      if (guild.owner_id !== user.id) {
        await respond(interaction, "Nur der Server-Eigentümer darf Rollen löschen.", true);
        return;
      }
      const roleResult = await deleteAllRoles(interaction.guild_id);
      const skippedMessage = roleResult.skipped.length > 0
        ? ` ${roleResult.skipped.length} Rollen konnten wegen Discord-Rechten oder der Rollen-Hierarchie nicht gelöscht werden.`
        : "";
      await respond(interaction, `Rollen-Löschung abgeschlossen: ${roleResult.deleted.length} Rollen gelöscht.${skippedMessage}`);
      return;
    }
    if (name === "clear") {
      if (!interaction.guild_id) {
        await respond(interaction, "Dieser Befehl funktioniert nur auf einem Server.", true);
        return;
      }
      const guildResponse = await rest(`/guilds/${interaction.guild_id}`);
      if (!guildResponse.ok) throw new Error(`Konnte Server-Eigentümer nicht prüfen: ${guildResponse.status}`);
      const guild = (await guildResponse.json()) as { owner_id: string };
      if (guild.owner_id !== user.id) {
        await respond(interaction, "Nur der Server-Eigentümer darf Website-Tiers löschen.", true);
        return;
      }
      const targetUserId = String(option(interaction, "user"));
      const cleared = await clearPlayerTiers(targetUserId);
      const resultLabel = cleared.removedCount === 1 ? "Ergebnis" : "Ergebnisse";
      await respond(
        interaction,
        `Website-Tiers für <@${targetUserId}> wurden entfernt: ${cleared.removedCount} ${resultLabel}.`,
        true,
      );
      return;
    }
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