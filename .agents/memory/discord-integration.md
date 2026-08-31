---
name: Discord integration boundary
description: Discord user OAuth and bot credentials have different capabilities in NexusTiers.
---

NexusTiers uses the Discord user connection for account context, but channel, message, role, gateway, and ticket automation require the separate `DISCORD_BOT_TOKEN` secret.

**Why:** Discord's user OAuth scopes do not grant bot-level management access, so trying to create channels or post messages through the user connection returns permission errors.

**How to apply:** Keep server-management calls behind the bot token and treat the user connection as identity/guild context only.