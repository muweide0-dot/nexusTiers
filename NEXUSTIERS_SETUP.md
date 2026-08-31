# NexusTiers

NexusTiers is a Minecraft PvP testing queue system with Discord ticket flow,
verified testers, kit queues, tier results, and a Fabric companion mod.

## Included

- Dashboard at `/` with all queue lanes and live capacity.
- Queue detail pages with positions 1–20, active testers, and current ticket.
- Discord commands:
  - `/open kit`
  - `/close kit`
  - `/next kit`
  - `/skip kit`
  - `/result kit tier`
  - `/verify ign`
  - `/enter kit ign tier region server`
  - `/createchannel`
- Discord channels: `request-test`, `results`, `tickets`, all
  `*-waitlist` channels, and the NexusTiers overview channel.
- Roles: `NexusTiers`, `Verified Tester`, every kit queue role, and all
  `lt5`/`ht5` through `lt1`/`ht1` kit combinations.
- Ticket channel creation for `/next`, result posts with player and tester
  mentions, and automatic queue shifting after `/result` or `/skip`.
- Fabric client mod for Minecraft 1.21.11 with the `N` lookup screen and best
  known tier cache for name-tag badges.

## Discord setup

1. Create a Discord Application and add a Bot.
2. Invite it to the target server with permissions to manage channels, manage
   roles, send messages, and use slash commands.
3. Store the bot token as the Replit Secret `DISCORD_BOT_TOKEN`.
4. Open the NexusTiers dashboard and use **Server setup**, or run
   `/createchannel` in the target server as an administrator.
5. The control commands require Administrator or the `Verified Tester` role.
   Set `DISCORD_TESTER_ROLE_ID` to the role ID for strict role-based access.

The dashboard uses the development database to keep queue positions and
results across restarts. The API exposes the same data that the Fabric mod
reads at `GET /api/players/{ign}/tiers`.

## Fabric mod

The source is in `mod/`. Set `API_BASE_URL` in
`mod/src/main/java/com/nexustiers/client/NexusTiersConfig.java` to the
published API URL, then build with Java 21 and Fabric Loom. Put the resulting
jar and the matching Fabric API jar into the client `mods` folder.