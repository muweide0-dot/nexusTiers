# NexusTiers

NexusTiers manages Minecraft PvP tester waitlists, Discord tickets, tier results, and a Fabric client lookup.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `DISCORD_BOT_TOKEN` — Discord bot gateway and server-management token

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/minecraft-queue` — NexusTiers web control center
- `artifacts/api-server/src/lib/nexus.ts` — queue, ticket, verification, result, and Discord setup logic
- `artifacts/api-server/src/lib/discord-bot.ts` — native Discord gateway and slash commands
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/db/src/schema/nexus-state.ts` — persisted NexusTiers state
- `mod/` — Fabric 1.21.11 client companion
- `NEXUSTIERS_SETUP.md` — Discord and Fabric setup instructions

## Architecture decisions

- Queue state is persisted as a single JSON document so queue movement and ticket transitions stay atomic from the app's point of view.
- The bot uses Discord's REST API and native Node WebSocket support, avoiding a second bot framework dependency.
- Slash-command tester access accepts Administrator or a configured `DISCORD_TESTER_ROLE_ID`; public player actions remain separate.
- The API contract is generated from OpenAPI and shared by the dashboard.

## Product

- Eight kit queues: UHC, Sword, Mace, Diapot, NethPot, SMP, Crystal, and Axe.
- Each queue has a maximum of 20 entries and automatically shifts positions after a result or skip.
- `/next` creates a ticket channel; `/result` posts the result with player/tester mentions.
- `/verify`, `/enter`, `/createchannel`, and tier roles are included.
- The Fabric mod exposes `N` for player lookup and best-tier display.

## User preferences

- Product name: NexusTiers.
- Deliver the complete source bundle as a ZIP when the build is finished.

## Gotchas

- The Discord user integration can list identity/guilds but cannot manage channels; server management is performed with the bot token.
- Invite the bot with channel/role management and message permissions before using `/createchannel`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
