import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { logger } from "./lib/logger";

type ChannelDefinition = {
  name: string;
  type: ChannelType.GuildText | ChannelType.GuildVoice;
};

type CategoryDefinition = {
  name: string;
  channels: ChannelDefinition[];
};

type TicketAnswer = {
  label: string;
  value: string;
};

const serverLayout: CategoryDefinition[] = [
  {
    name: "══════ 🔔 Informationen ══════",
    channels: [
      { name: "📢 || ankündigungen", type: ChannelType.GuildText },
      { name: "📜 || regelwerk", type: ChannelType.GuildText },
      { name: "⚙️ || changelogs", type: ChannelType.GuildText },
      { name: "💀 || staff-changelog", type: ChannelType.GuildText },
      { name: "📨 || server-status", type: ChannelType.GuildText },
      { name: "🎉 || giveaway", type: ChannelType.GuildText },
      { name: "📺 || leaks", type: ChannelType.GuildText },
    ],
  },
  {
    name: "══════ 💬 General ══════",
    channels: [
      { name: "💬 || chat", type: ChannelType.GuildText },
      { name: "🤖 || bot-commands", type: ChannelType.GuildText },
      { name: "🎥 || self-promotion", type: ChannelType.GuildText },
      { name: "⭐ || feedback", type: ChannelType.GuildText },
      { name: "❓ || fragen", type: ChannelType.GuildText },
    ],
  },
  {
    name: "══════ 🎙️ Voice Channel ══════",
    channels: [
      { name: "🎙️ || + Channel Erstellen", type: ChannelType.GuildVoice },
      { name: "🔈 || Talk 1", type: ChannelType.GuildVoice },
      { name: "🔈 || Talk 2", type: ChannelType.GuildVoice },
      { name: "🔈 || Talk 3", type: ChannelType.GuildVoice },
      { name: "🔈 || Talk Duo 1", type: ChannelType.GuildVoice },
      { name: "🔈 || Talk Trio 1", type: ChannelType.GuildVoice },
      { name: "🔈 || Talk Trio 2", type: ChannelType.GuildVoice },
    ],
  },
  {
    name: "══════ 🧰 Support ══════",
    channels: [
      { name: "🎟️ || ticket-erstellen", type: ChannelType.GuildText },
      { name: "🔈 || Support Queue", type: ChannelType.GuildVoice },
    ],
  },
];

const supportCategoryName = "══════ 🧰 Support ══════";
const ticketCommand = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Postet das Ticket-Menü mit Support, Report und Bewerbung.");

const ticketTypes = {
  ticket_support: {
    label: "Support",
    emoji: "🛟",
    description: "Erstelle ein Support-Ticket für Hilfe und Fragen.",
  },
  ticket_report: {
    label: "Report",
    emoji: "🚨",
    description: "Melde einen Spieler, Vorfall oder Regelverstoß.",
  },
  ticket_application: {
    label: "Bewerbung",
    emoji: "📝",
    description: "Deine Bewerbungsangaben stehen unten im Ticket.",
  },
} as const;

async function registerCommands(client: Client): Promise<void> {
  if (!client.user) {
    return;
  }

  const rest = new REST({ version: "10" }).setToken(process.env["DISCORD_TOKEN"]!);
  const commandData = [ticketCommand.toJSON()];
  const configuredGuildId = process.env["DISCORD_GUILD_ID"];

  if (configuredGuildId) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, configuredGuildId), {
      body: commandData,
    });
    logger.info({ guildId: configuredGuildId }, "Discord ticket command registered");
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
      body: commandData,
    });
  }

  logger.info({ guildCount: client.guilds.cache.size }, "Discord ticket command registered for all joined guilds");
}

function findExistingChannel(guild: Guild, name: string, type: ChannelType, parentId?: string) {
  return guild.channels.cache.find(
    (channel) =>
      channel.name === name &&
      channel.type === type &&
      (parentId === undefined || channel.parentId === parentId),
  );
}

async function setupServer(guild: Guild): Promise<number> {
  let createdCount = 0;

  for (const categoryDefinition of serverLayout) {
    let category = guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory && channel.name === categoryDefinition.name,
    );

    if (!category || category.type !== ChannelType.GuildCategory) {
      category = await guild.channels.create({
        name: categoryDefinition.name,
        type: ChannelType.GuildCategory,
      });
      createdCount += 1;
    }

    for (const channelDefinition of categoryDefinition.channels) {
      const existingChannel = findExistingChannel(
        guild,
        channelDefinition.name,
        channelDefinition.type,
      );

      if (!existingChannel) {
        await guild.channels.create({
          name: channelDefinition.name,
          type: channelDefinition.type,
          parent: category.id,
        });
        createdCount += 1;
      }
    }
  }

  return createdCount;
}

function hasExistingServerLayout(guild: Guild): boolean {
  return serverLayout.some((categoryDefinition) =>
    guild.channels.cache.some(
      (channel) =>
        channel.type === ChannelType.GuildCategory && channel.name === categoryDefinition.name,
    ),
  );
}

function sanitizeChannelName(username: string): string {
  return (
    username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "user"
  );
}

async function getSupportCategory(guild: Guild) {
  const existingCategory = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === supportCategoryName,
  );

  if (existingCategory?.type === ChannelType.GuildCategory) {
    return existingCategory;
  }

  return guild.channels.create({
    name: supportCategoryName,
    type: ChannelType.GuildCategory,
  });
}

function findOpenTicket(guild: Guild, userId: string, ticketKey: keyof typeof ticketTypes) {
  const topic = `ticket:${userId}:${ticketKey}`;
  return guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.topic === topic,
  );
}

async function createTicket(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  ticketKey: keyof typeof ticketTypes,
  client: Client,
  answers: TicketAnswer[],
): Promise<{ channel: TextChannel; created: boolean }> {
  if (!interaction.guild) {
    throw new Error("Tickets can only be created inside a guild");
  }

  const topic = `ticket:${interaction.user.id}:${ticketKey}`;
  const existingChannel = findOpenTicket(interaction.guild, interaction.user.id, ticketKey);

  if (existingChannel?.type === ChannelType.GuildText) {
    return { channel: existingChannel, created: false };
  }

  const category = await getSupportCategory(interaction.guild);
  const ticketType = ticketTypes[ticketKey];
  const botId = interaction.guild.members.me?.id ?? client.user?.id;
  const permissionOverwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  if (interaction.guild.ownerId !== interaction.user.id) {
    permissionOverwrites.push({
      id: interaction.guild.ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (botId) {
    permissionOverwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const supportRoleId = process.env["TICKET_SUPPORT_ROLE_ID"];
  if (supportRoleId) {
    permissionOverwrites.push({
      id: supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${ticketKey.replace("ticket_", "")}-${sanitizeChannelName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites,
  });

  const closeButton = new ButtonBuilder()
    .setCustomId(`ticket-close:${interaction.user.id}`)
    .setLabel("Ticket schließen")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Danger);

  await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${ticketType.emoji} ${ticketType.label}-Ticket`)
        .setDescription(
          `${ticketType.description}\n\nBeschreibe dein Anliegen so ausführlich wie möglich. Ein Teammitglied wird sich bald darum kümmern.`,
        )
        .addFields(
          answers.map((answer) => ({
            name: answer.label,
            value: answer.value.slice(0, 1024),
          })),
        ),
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton)],
  });

  return { channel, created: true };
}

function buildTextInput(
  customId: string,
  label: string,
  style: TextInputStyle,
  required = true,
): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);
}

function buildTicketModal(ticketKey: keyof typeof ticketTypes): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`ticket-modal:${ticketKey}`)
    .setTitle(`${ticketTypes[ticketKey].label}-Ticket`);

  const inputs =
    ticketKey === "ticket_support"
      ? [
          buildTextInput(
            "support_reason",
            "Warum möchtest du ein Support-Ticket erstellen?",
            TextInputStyle.Paragraph,
          ),
        ]
      : ticketKey === "ticket_report"
        ? [
            buildTextInput("report_user", "Wen möchtest du reporten?", TextInputStyle.Short),
            buildTextInput("report_reason", "Warum möchtest du reporten?", TextInputStyle.Paragraph),
          ]
        : [
            buildTextInput("application_igname", "Wie heißt du im Game?", TextInputStyle.Short),
            buildTextInput("application_youtube", "Wie heißt du auf YouTube?", TextInputStyle.Short),
            buildTextInput("application_text", "Schreibe deine Bewerbung", TextInputStyle.Paragraph),
          ];

  return modal.addComponents(
    ...inputs.map((input) => new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
  );
}

async function postTicketPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName !== "ticket") {
    return;
  }

  if (!interaction.guild || interaction.channel?.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Das Ticket-Menü kann nur in einem Server-Textkanal gepostet werden.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.guild.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: "Nur der Server-Owner darf das Ticket-Menü posten.",
      ephemeral: true,
    });
    return;
  }

  const buttons = Object.entries(ticketTypes).map(([customId, ticketType]) =>
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(ticketType.label)
      .setEmoji(ticketType.emoji)
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎫 Ticket-System")
        .setDescription(
          "Wähle unten den passenden Bereich aus. Für jedes Anliegen wird ein privater Channel erstellt.",
        )
        .addFields(
          { name: "🛟 Support", value: "Allgemeine Hilfe und Fragen", inline: true },
          { name: "🚨 Report", value: "Spieler oder Vorfälle melden", inline: true },
          { name: "📝 Bewerbung", value: "Deine Bewerbung einreichen", inline: true },
        ),
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)],
  });

  await interaction.reply({
    content: "Das Ticket-Menü wurde gepostet.",
    ephemeral: true,
  });
}

async function handleButtonInteraction(interaction: ButtonInteraction, client: Client): Promise<void> {
  if (!interaction.guild) {
    return;
  }

  if (interaction.customId.startsWith("ticket-close:")) {
    const ticketOwnerId = interaction.channel?.isTextBased()
      ? (interaction.channel as TextChannel).topic?.split(":")[1]
      : undefined;
    const canClose =
      ticketOwnerId === interaction.user.id ||
      interaction.guild.ownerId === interaction.user.id ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

    if (!canClose) {
      await interaction.reply({
        content: "Nur der Ticket-Ersteller, der Server-Owner oder ein Channel-Manager darf dieses Ticket schließen.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: "Dieses Ticket wird geschlossen.",
      ephemeral: true,
    });
    setTimeout(() => {
      void interaction.channel?.delete("Ticket geschlossen").catch((error) => {
        logger.error({ err: error }, "Failed to close Discord ticket");
      });
    }, 1_000);
    return;
  }

  if (!(interaction.customId in ticketTypes)) {
    return;
  }

  const ticketKey = interaction.customId as keyof typeof ticketTypes;
  const existingChannel = findOpenTicket(interaction.guild, interaction.user.id, ticketKey);

  if (existingChannel?.type === ChannelType.GuildText) {
    await interaction.reply({
      content: `Du hast bereits ein offenes Ticket für diesen Bereich: ${existingChannel}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.showModal(buildTicketModal(ticketKey));
}

function getSubmittedAnswers(
  interaction: ModalSubmitInteraction,
  ticketKey: keyof typeof ticketTypes,
): TicketAnswer[] {
  if (ticketKey === "ticket_support") {
    return [
      {
        label: "Warum möchtest du ein Support-Ticket erstellen?",
        value: interaction.fields.getTextInputValue("support_reason"),
      },
    ];
  }

  if (ticketKey === "ticket_report") {
    return [
      { label: "Wen möchtest du reporten?", value: interaction.fields.getTextInputValue("report_user") },
      { label: "Warum möchtest du reporten?", value: interaction.fields.getTextInputValue("report_reason") },
    ];
  }

  return [
    { label: "In-Game-Name", value: interaction.fields.getTextInputValue("application_igname") },
    { label: "YouTube-Name", value: interaction.fields.getTextInputValue("application_youtube") },
    { label: "Bewerbung", value: interaction.fields.getTextInputValue("application_text") },
  ];
}

async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
  if (!interaction.guild || !interaction.customId.startsWith("ticket-modal:")) {
    return;
  }

  const rawTicketKey = interaction.customId.slice("ticket-modal:".length);
  if (!(rawTicketKey in ticketTypes)) {
    return;
  }

  const ticketKey = rawTicketKey as keyof typeof ticketTypes;
  await interaction.deferReply({ ephemeral: true });

  const existingChannel = findOpenTicket(interaction.guild, interaction.user.id, ticketKey);
  if (existingChannel?.type === ChannelType.GuildText) {
    await interaction.editReply(`Du hast bereits ein offenes Ticket für diesen Bereich: ${existingChannel}`);
    return;
  }

  const answers = getSubmittedAnswers(interaction, ticketKey);
  const { channel, created } = await createTicket(interaction, ticketKey, client, answers);
  await interaction.editReply(
    created
      ? `Dein Ticket wurde erstellt: ${channel}`
      : `Du hast bereits ein offenes Ticket für diesen Bereich: ${channel}`,
  );
}

export function startDiscordBot(): void {
  const token = process.env["DISCORD_TOKEN"];

  if (!token) {
    logger.warn("DISCORD_TOKEN is not configured; Discord bot is disabled");
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Discord bot connected");

    try {
      await registerCommands(readyClient);

      for (const guild of readyClient.guilds.cache.values()) {
        if (hasExistingServerLayout(guild)) {
          logger.info({ guildId: guild.id }, "Discord server layout already present; skipping setup");
          continue;
        }

        const createdCount = await setupServer(guild);
        logger.info(
          { guildId: guild.id, createdCount },
          createdCount > 0
            ? "Discord server layout created automatically"
            : "Discord server layout already complete",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to register ticket command or create server layout");
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) {
      void postTicketPanel(interaction).catch((error) => {
        logger.error({ err: error }, "Failed to post Discord ticket panel");
      });
      return;
    }

    if (interaction.isButton()) {
      void handleButtonInteraction(interaction, client).catch((error) => {
        logger.error({ err: error }, "Discord ticket interaction failed");
      });
      return;
    }

    if (interaction.isModalSubmit()) {
      void handleModalSubmit(interaction, client).catch((error) => {
        logger.error({ err: error }, "Discord ticket form submission failed");
      });
    }
  });

  client.login(token).catch((error) => {
    logger.error({ err: error }, "Discord bot login failed");
  });
}