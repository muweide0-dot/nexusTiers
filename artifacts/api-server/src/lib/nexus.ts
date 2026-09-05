import { eq } from "drizzle-orm";
import { db, nexusStateTable } from "@workspace/db";
import {
  GetQueueParams,
  GetPlayerTiersParams,
  JoinQueueParams,
  OpenQueueParams,
  CloseQueueParams,
  NextTicketParams,
  SkipTicketParams,
  SetupServerBody,
  SubmitResultBody,
  VerifyAccountBody,
  ApplyWaitlistBody,
} from "@workspace/api-zod";
import { logger } from "./logger";

export const KITS = [
  "uhc",
  "sword",
  "mace",
  "diapot",
  "nethpot",
  "smp",
  "crystal",
  "axe",
] as const;
export type Kit = (typeof KITS)[number];
export const KIT_LABELS: Record<Kit, string> = {
  uhc: "UHC",
  sword: "Sword",
  mace: "Mace",
  diapot: "Diapot",
  nethpot: "NethPot",
  smp: "SMP",
  crystal: "Crystal",
  axe: "Axe",
};
export const TIERS = [
  "N/A",
  "lt5",
  "ht5",
  "lt4",
  "ht4",
  "lt3",
  "ht3",
  "lt2",
  "ht2",
  "lt1",
  "ht1",
] as const;

type Tier = (typeof TIERS)[number];
type QueueEntry = {
  id: string;
  position: number;
  discordUserId: string;
  username: string;
  ign: string;
  currentTier: string;
  region: string;
  server: string;
  joinedAt: string;
};
type Tester = {
  discordUserId: string;
  username: string;
  region: string;
  active: boolean;
};
type Ticket = {
  id: string;
  kit: string;
  player: QueueEntry;
  tester: Tester;
  status: "open" | "skipped" | "completed";
  openedAt: string;
};
type Queue = {
  kit: Kit;
  label: string;
  status: "open" | "closed";
  entries: QueueEntry[];
  activeTesters: Tester[];
  currentTicket: Ticket | null;
  lastUpdate: string;
};
type TierResult = {
  id: string;
  playerUsername: string;
  ign: string;
  kit: string;
  tier: string;
  previousTier: string;
  testerName: string;
  createdAt: string;
  discordMessage?: string;
  playerDiscordUserId?: string;
  region?: string;
};
type ActivityItem = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  kind: "queue" | "ticket" | "result" | "setup" | "verification";
};
export type NexusState = {
  queues: Record<Kit, Queue>;
  results: TierResult[];
  verified: Array<{
    discordUserId: string;
    username: string;
    ign: string;
    verifiedAt: string;
  }>;
  activity: ActivityItem[];
};

const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function seedState(): NexusState {
  const testers: Tester[] = [
    {
      discordUserId: "733734885822431364",
      username: "Qloxyz_",
      region: "EU",
      active: true,
    },
    {
      discordUserId: "1439980592191246376",
      username: "NexusTester",
      region: "EU",
      active: true,
    },
  ];
  const names = [
    ["Marlow", "MarlowPvP", "ht4"],
    ["Kitsu", "KitsuMC", "lt4"],
    ["Riven", "RivenFPS", "N/A"],
    ["Tobi", "Tobi_Clips", "lt5"],
    ["Nox", "Noxious", "ht5"],
    ["Sora", "SoraBuilds", "N/A"],
  ];
  const queues = Object.fromEntries(
    KITS.map((kit, kitIndex) => {
      const entries: QueueEntry[] = (kitIndex === 1
        ? names
        : names.slice(0, Math.max(1, 4 - Math.floor(kitIndex / 2)))
      ).map(([username, ign, currentTier], index) => ({
        id: `seed_${kit}_${index}`,
        position: index + 1,
        discordUserId: `${100000000000000000 + kitIndex * 100 + index}`,
        username,
        ign,
        currentTier,
        region: index % 3 === 0 ? "EU" : index % 3 === 1 ? "NA" : "AS",
        server: index % 2 === 0 ? "eu.practice.net" : "na.practice.net",
        joinedAt: new Date(Date.now() - index * 1000 * 60 * 17).toISOString(),
      }));
      return [
        kit,
        {
          kit,
          label: KIT_LABELS[kit],
          status: kit === "uhc" ? "closed" : "open",
          entries,
          activeTesters: testers.slice(0, kit === "crystal" ? 1 : 2),
          currentTicket: null,
          lastUpdate: now(),
        } satisfies Queue,
      ];
    }),
  ) as Record<Kit, Queue>;

  return {
    queues,
    verified: [
      {
        discordUserId: "733734885822431364",
        username: "Qloxyz_",
        ign: "Qloxyz_",
        verifiedAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    results: [
      {
        id: "seed_result_1",
        playerUsername: "Qloxyz_",
        ign: "Qloxyz_",
        kit: "sword",
        tier: "lt4",
        previousTier: "ht4",
        testerName: "Qloxyz_",
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        discordMessage:
          "Qloxyz_'s Test Results — Tester: <@733734885822431364> — Region: EU — Previous Rank: High Tier 4 — Rank Earned: Low Tier 4",
        playerDiscordUserId: "733734885822431364",
        region: "EU",
      },
    ],
    activity: [
      {
        id: "seed_activity_1",
        title: "Crystal queue opened",
        description: "The Crystal waitlist is accepting players.",
        timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        kind: "queue",
      },
      {
        id: "seed_activity_2",
        title: "Result recorded",
        description: "Qloxyz_ received lt4 in Sword.",
        timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
        kind: "result",
      },
    ],
  };
}

let cached: NexusState | null = null;
let saving: Promise<void> = Promise.resolve();

export async function getState(): Promise<NexusState> {
  if (cached) return cached;
  try {
    const rows = await db.select().from(nexusStateTable).where(eq(nexusStateTable.id, 1));
    cached = (rows[0]?.data as NexusState | undefined) ?? null;
  } catch (error) {
    logger.warn({ error }, "Nexus state database read failed; using memory");
  }
  if (!cached || !cached.queues) {
    cached = seedState();
    await saveState(cached);
  }
  return cached;
}

export function saveState(state: NexusState): Promise<void> {
  cached = state;
  saving = saving
    .catch(() => undefined)
    .then(async () => {
      try {
        await db
          .insert(nexusStateTable)
          .values({ id: 1, data: state })
          .onConflictDoUpdate({
            target: nexusStateTable.id,
            set: { data: state, updatedAt: new Date() },
          });
      } catch (error) {
        logger.warn({ error }, "Nexus state database write failed; keeping memory");
      }
    });
  return saving;
}

export function normalizePositions(queue: Queue) {
  queue.entries.forEach((entry, index) => {
    entry.position = index + 1;
  });
}

export function getQueue(state: NexusState, kit: string): Queue | undefined {
  return KITS.includes(kit as Kit) ? state.queues[kit as Kit] : undefined;
}

export function queueOverview(queue: Queue) {
  return {
    kit: queue.kit,
    label: queue.label,
    status: queue.status,
    count: queue.entries.length,
    max: 20,
    activeTesters: queue.activeTesters.length,
    channelName: `${queue.kit}-waitlist`,
    lastUpdate: queue.lastUpdate,
  };
}

function addActivity(
  state: NexusState,
  title: string,
  description: string,
  kind: ActivityItem["kind"],
) {
  state.activity.unshift({ id: id("activity"), title, description, timestamp: now(), kind });
  state.activity = state.activity.slice(0, 30);
}

const TIER_POINTS: Record<string, number> = {
  ht1: 60,
  lt1: 45,
  ht2: 30,
  lt2: 20,
  ht3: 10,
  lt3: 6,
  ht4: 4,
  lt4: 3,
  ht5: 2,
  lt5: 1,
};

function tierRank(tier: string) {
  const match = tier.toLowerCase().match(/^(?:lt|ht)([1-7])$/);
  if (!match) return 999;
  return Number(match[1]) * 2 + (tier.toLowerCase().startsWith("lt") ? 1 : 0);
}

export async function getLeaderboard() {
  const state = await getState();
  const players = new Map<string, { username: string; ign: string; points: number; results: number; bestTier: string; lastResult: string; kits: string[] }>();
  for (const result of state.results) {
    const key = result.playerDiscordUserId ?? result.ign.toLowerCase();
    const current = players.get(key) ?? { username: result.playerUsername, ign: result.ign, points: 0, results: 0, bestTier: "N/A", lastResult: result.createdAt, kits: [] };
    current.points += TIER_POINTS[result.tier.toLowerCase()] ?? 0;
    current.results += 1;
    if (!current.kits.includes(result.kit)) current.kits.push(result.kit);
    if (tierRank(result.tier) < tierRank(current.bestTier)) current.bestTier = result.tier;
    if (new Date(result.createdAt).getTime() > new Date(current.lastResult).getTime()) current.lastResult = result.createdAt;
    players.set(key, current);
  }
  return Array.from(players.values())
    .sort((a, b) => b.points - a.points || b.results - a.results || a.ign.localeCompare(b.ign))
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

export async function getKitRanking(kitValue: string) {
  if (!KITS.includes(kitValue as Kit)) throw new Error("Unknown kit");
  const kit = kitValue as Kit;
  const state = await getState();
  const latestByPlayer = new Map<string, TierResult>();

  for (const result of state.results) {
    if (result.kit !== kit) continue;
    const key = result.playerDiscordUserId ?? result.ign.toLowerCase();
    const current = latestByPlayer.get(key);
    if (!current || new Date(result.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latestByPlayer.set(key, result);
    }
  }

  const tiers = Array.from({ length: 5 }, (_, index) => ({
    tier: index + 1,
    players: [] as Array<{ ign: string; username: string; tier: string; region?: string; createdAt: string }>,
  }));

  for (const result of latestByPlayer.values()) {
    const match = result.tier.toLowerCase().match(/^(?:ht|lt)([1-5])$/);
    if (!match) continue;
    tiers[Number(match[1]) - 1].players.push({
      ign: result.ign,
      username: result.playerUsername,
      tier: result.tier.toLowerCase(),
      region: result.region,
      createdAt: result.createdAt,
    });
  }

  for (const column of tiers) {
    column.players.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.ign.localeCompare(b.ign));
  }

  return { kit, label: KIT_LABELS[kit], totalPlayers: latestByPlayer.size, tiers };
}

export async function openQueue(_input: unknown, kitValue: string) {
  const kit = OpenQueueParams.parse({ kit: kitValue }).kit as Kit;
  const queue = (await getState()).queues[kit];
  queue.status = "open";
  queue.lastUpdate = now();
  const state = await getState();
  addActivity(state, `${queue.label} queue opened`, "Players can join the waitlist.", "queue");
  await saveState(state);
  return queue;
}

export async function closeQueue(_input: unknown, kitValue: string) {
  const kit = CloseQueueParams.parse({ kit: kitValue }).kit as Kit;
  const state = await getState();
  const queue = state.queues[kit];
  queue.status = "closed";
  queue.lastUpdate = now();
  addActivity(state, `${queue.label} queue closed`, "The waitlist is no longer accepting entries.", "queue");
  await saveState(state);
  return queue;
}

export async function nextTicket(input: unknown, kitValue: string) {
  const kit = NextTicketParams.parse({ kit: kitValue }).kit as Kit;
  const state = await getState();
  const queue = state.queues[kit];
  if (queue.currentTicket) throw new Error("A ticket is already open for this queue.");
  const player = queue.entries[0];
  const tester = queue.activeTesters[0];
  if (!player || !tester) throw new Error("No queued player or active tester is available.");
  queue.currentTicket = {
    id: id("ticket"),
    kit,
    player,
    tester,
    status: "open",
    openedAt: now(),
  };
  queue.lastUpdate = now();
  addActivity(state, `Ticket opened for ${player.username}`, `${queue.label} • tester ${tester.username}`, "ticket");
  await saveState(state);
  return queue.currentTicket;
}

export async function skipTicket(input: unknown, kitValue: string) {
  const kit = SkipTicketParams.parse({ kit: kitValue }).kit as Kit;
  const state = await getState();
  const queue = state.queues[kit];
  if (!queue.currentTicket) throw new Error("There is no active ticket.");
  queue.currentTicket.status = "skipped";
  queue.entries.shift();
  normalizePositions(queue);
  queue.currentTicket = null;
  queue.lastUpdate = now();
  addActivity(state, `Ticket skipped in ${queue.label}`, "The player was removed from the front of the queue.", "ticket");
  await saveState(state);
  return queue;
}

export async function joinQueue(input: unknown, kitValue: string) {
  const kit = JoinQueueParams.parse({ kit: kitValue }).kit as Kit;
  const data = ApplyWaitlistBody.parse(input);
  const state = await getState();
  const queue = state.queues[kit];
  if (queue.status !== "open") throw new Error("This queue is closed.");
  if (queue.entries.length >= 20) throw new Error("This queue is full.");
  if (queue.entries.some((entry) => entry.discordUserId === data.discordUserId)) {
    throw new Error("This player is already in the queue.");
  }
  const entry: QueueEntry = {
    id: id("entry"),
    position: queue.entries.length + 1,
    discordUserId: data.discordUserId,
    username: data.username,
    ign: data.ign,
    currentTier: data.currentTier,
    region: data.region,
    server: data.server,
    joinedAt: now(),
  };
  queue.entries.push(entry);
  queue.lastUpdate = now();
  addActivity(state, `${data.username} joined ${queue.label}`, `Position ${entry.position} • ${data.region}`, "queue");
  await saveState(state);
  return entry;
}

export async function verifyAccount(input: unknown) {
  const data = VerifyAccountBody.parse(input);
  const state = await getState();
  const verified = { ...data, verifiedAt: now() };
  state.verified = [
    verified,
    ...state.verified.filter((item) => item.discordUserId !== data.discordUserId),
  ];
  addActivity(state, `${data.username} verified`, `Minecraft account ${data.ign} linked.`, "verification");
  await saveState(state);
  return verified;
}

export async function submitResult(input: unknown) {
  const data = SubmitResultBody.parse(input);
  const state = await getState();
  const kit = data.kit as Kit;
  const queue = state.queues[kit];
  const result: TierResult = {
    id: id("result"),
    playerUsername: data.playerUsername,
    ign: data.ign,
    kit,
    tier: data.tier,
    previousTier: data.previousTier,
    testerName: data.testerName,
    createdAt: now(),
    playerDiscordUserId: data.playerDiscordUserId,
    region: data.region,
  };
  result.discordMessage = [
    `${data.playerUsername}'s Test Results`,
    `Tester: <@${data.testerId}>`,
    `Region: ${data.region ?? "N/A"}`,
    `Username: ${data.ign}`,
    `Previous Rank: ${data.previousTier || "N/A"}`,
    `Rank Earned: ${data.tier}`,
  ].join("\n");
  state.results.unshift(result);
  if (queue.currentTicket) {
    queue.currentTicket.status = "completed";
    queue.entries.shift();
    normalizePositions(queue);
    queue.currentTicket = null;
    queue.lastUpdate = now();
  }
  addActivity(state, `${data.ign} received ${data.tier}`, `${KIT_LABELS[kit]} result by ${data.testerName}.`, "result");
  await saveState(state);
  return result;
}

export async function playerProfile(ignValue: string) {
  const ign = GetPlayerTiersParams.parse({ ign: ignValue }).ign;
  const state = await getState();
  const tiers = state.results.filter((result) => result.ign.toLowerCase() === ign.toLowerCase());
  const rank = (tier: string) => (tier === "N/A" ? 999 : Number(tier.slice(2)) * 2 + (tier.startsWith("lt") ? 1 : 0));
  const bestTier = tiers.sort((a, b) => rank(a.tier) - rank(b.tier))[0]?.tier ?? "N/A";
  return { ign, username: tiers[0]?.playerUsername ?? ign, bestTier, tiers };
}

const TIER_NAMES = ["lt5", "ht5", "lt4", "ht4", "lt3", "ht3", "lt2", "ht2", "lt1", "ht1"];
const channelNames = ["nexus", "request-test", "results", "tickets", ...KITS.map((kit) => `${kit}-waitlist`)];
const tierRoleNames = TIER_NAMES.flatMap((tier) => KITS.map((kit) => `${tier} ${kit}`));

async function discordRequest(path: string, init: RequestInit = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export async function setupServer(input: unknown) {
  const data = SetupServerBody.parse(input);
  const [channels, roles] = await Promise.all([
    discordRequest(`/guilds/${data.guildId}/channels`),
    discordRequest(`/guilds/${data.guildId}/roles`),
  ]) as [Array<{ name: string; id: string }>, Array<{ name: string; id: string; hoist?: boolean; managed?: boolean }>];
  const createdChannels: string[] = [];
  for (const name of channelNames) {
    if (channels.some((channel) => channel.name === name)) continue;
    await discordRequest(`/guilds/${data.guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name, type: 0 }),
    });
    createdChannels.push(name);
  }
  const desiredRoles = [
    { name: "NexusTiers", hoist: true },
    { name: "Verified Tester", hoist: true },
    ...KITS.map((kit) => ({ name: `${KIT_LABELS[kit]} Queue`, hoist: false })),
    ...tierRoleNames.map((name) => ({ name, hoist: true })),
  ];
  const createdRoles: string[] = [];
  for (const desired of desiredRoles) {
    const existingRole = roles.find((role) => role.name.toLowerCase() === desired.name.toLowerCase());
    if (existingRole) {
      if (!existingRole.managed && (existingRole.name !== desired.name || existingRole.hoist !== desired.hoist)) {
        await discordRequest(`/guilds/${data.guildId}/roles/${existingRole.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: desired.name, hoist: desired.hoist }),
        });
      }
      continue;
    }
    await discordRequest(`/guilds/${data.guildId}/roles`, {
      method: "POST",
      body: JSON.stringify({ name: desired.name, hoist: desired.hoist, mentionable: false }),
    });
    createdRoles.push(desired.name);
  }
  const state = await getState();
  addActivity(state, "Discord server setup complete", `${createdChannels.length} channels and ${createdRoles.length} roles created.`, "setup");
  await saveState(state);
  return {
    guildId: data.guildId,
    createdChannels,
    createdRoles,
    message: `NexusTiers setup complete: ${createdChannels.length} channels and ${createdRoles.length} roles created.`,
  };
}

export async function discordApi(path: string, init: RequestInit = {}) {
  return discordRequest(path, init);
}