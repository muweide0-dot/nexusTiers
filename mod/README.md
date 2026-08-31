# NexusTiers Fabric Mod

Client-side companion for Minecraft Java **1.21.11**.

## Features

- Shows the best known NexusTiers result for nearby players in a compact sword + tier badge.
- Press `N` to open the player tier lookup screen.
- Search a Minecraft IGN and view every recorded kit result.
- Reads from the NexusTiers API configured in `NexusTiersConfig`.

## Build

Install Java 21 and run:

```bash
./gradlew build
```

Copy the generated jar from `build/libs/` into the Fabric `mods` folder together
with Fabric API for Minecraft 1.21.11.

The API URL defaults to `http://localhost:5000/api`. Change it in
`src/main/java/com/nexustiers/client/NexusTiersConfig.java` before building if
the bot runs on another host.