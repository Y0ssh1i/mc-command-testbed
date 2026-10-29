# Existing tools and how this differs

Checked on 2026-10-25 with GitHub search and the projects' READMEs. Star counts are from that day.

| Tool | What it is | Needs | Overlap | Difference |
|---|---|---|---|---|
| [PackTest](https://github.com/misode/packtest) (32 stars) | Fabric mod; tests are `.mcfunction` files inside a datapack, with `assert` and `await`, can run headless in CI | Fabric server + the mod + a datapack | Plain-command tests, CI | Tests one datapack inside the game's test framework. No notion of several players each running a line. |
| [Ward](https://github.com/mcbookshelf/ward) (6 stars) | Mod + Python CLI that runs datapack tests written as `.mcfunction`, on one or more versions | Its mod, Python 3.14+ | Same family as PackTest | Same as above. |
| Mojang `/test` (GameTest) | Built-in Java Edition command (usable in normal play since 25w03a, per the Minecraft Wiki) to run registered tests in structures; Bedrock has a separate GameTest scripting API | Test definitions registered through a pack/mod | Official test framework | Structure-based tests defined ahead of time, not a script of commands played by named players. |
| [Plugwright](https://github.com/Drownek/plugwright) (46 stars) | End-to-end tests for Paper/Spigot plugins; mineflayer bots join, move, chat, click GUIs; JS/TS tests | A plugin project, Gradle, Paper | Mineflayer bots on a local server | Targets plugin developers writing TypeScript tests. Not for people who only have commands. |
| [SoulFire](https://github.com/soulfiremc-com/SoulFire) (626), [mc-bots](https://github.com/crpmax/mc-bots) (539), [minecraft-stress-test](https://github.com/PureGero/minecraft-stress-test) (154) | Bot tools for server load/stress testing | A server to point at | Many bots | Load, not scenario results; no per-line pass/fail. |
| [mineflayer](https://github.com/PrismarineJS/mineflayer) (7.6k stars) | JS library for Minecraft bots | Node.js | Used here as the player engine | A library, not a test runner. |
| Carpet mod `/player` | Spawns fake players inside the game (from general knowledge; its wiki page could not be read in this check) | Fabric + Carpet | Fake players | In-game, needs a mod, no scripted report. |

## One-line difference

Vanilla server + real-protocol players, driven by a plain command script where each line names who runs it, ending in a pass/fail table. No mod, no plugin, no datapack.

## When to use something else

- You are testing a datapack and can install a mod: PackTest or Ward.
- You are testing a Paper/Spigot plugin: Plugwright.
- You need hundreds of bots: SoulFire or mc-bots.
- You need Bedrock: not covered here.

## Demand

Not measured yet. Related tools have tens to hundreds of stars, which says the area is used but not how many people need this exact shape. The plan is to record stars, issues and mentions from creators who make command-heavy content, starting from the public release.
