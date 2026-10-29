# mc-command-testbed

Try a big pile of Minecraft commands with several players, without gathering people or placing command blocks.

One command starts a throw-away **vanilla Java Edition server** on your own machine, brings in N **fake players**, runs a plain **command script** where each line says *who* runs it, then prints a **result table**: which line passed, which failed, and how long the run took.

```
$ mctestbed run examples/broken.mcfunction --accept-eula

line  as     step                                   result  time  output
----  -----  -------------------------------------  ------  ----  --------------------------------------------------
4     Alice  scoreboard objectives add pts dummy    PASS    82ms  Created new objective [pts]
5     Alice  scoreboard players add @s pts 1        PASS    67ms  Added 1 to [pts] for Alice (now 1)
6     Alice  this_is_not_a_command foo              FAIL    77ms  Unknown or incomplete command. See below for er...
8     Bob    scoreboard players add @s pts 1        PASS    76ms  Added 1 to [pts] for Bob (now 1)
9     -      #@ assert if score Bob pts matches 99  FAIL    9ms   Test failed
12    Bob    scoreboard players get Nobody pts      PASS    66ms  Can't get value of pts for Nobody; none is set

4/6 steps passed, 2 failed (script lines: 6, 9)
test run: 0.4s  (server start: 10.1s, players joined: 2.0s, total: 13.7s)
```

(Real output, see [docs/demo-broken.txt](docs/demo-broken.txt) and [docs/demo-three-players.txt](docs/demo-three-players.txt). Japanese: [README.ja.md](README.ja.md).)

## Who this is for

People who make **command-heavy content** (adventure maps, minigames, videos, server events) and want to check "does this run when Alice, Bob and Carol each do their part?" before filming or shipping. You do not need a mod, a plugin, or a datapack.

If you are writing a datapack and can install a mod, [PackTest](https://github.com/misode/packtest) or [Ward](https://github.com/mcbookshelf/ward) are built for that and may suit you better. See [docs/existing-tools.md](docs/existing-tools.md) for the comparison.

## What it does (v0.1)

- Starts a vanilla server for one Minecraft version (default **1.21.11**), you can specify with `--mc <version>` (e.g. `--mc 1.20.1`), grammar tables per version are in `versions/<version>.yaml`, adding a version means just adding that one file.
- You fetch the server from Mojang yourself: `mctestbed fetch-server` downloads the official `server.jar` into a local cache and checks its sha1. The jar is never bundled or redistributed here. You must pass `--accept-eula` to confirm you accept the [Minecraft EULA](https://aka.ms/MinecraftEULA).
- Brings in N fake players using [mineflayer](https://github.com/PrismarineJS/mineflayer) and makes them operators.
- Runs a script. Player lines go through that player's own chat packet (`--as-mode chat`, default), so permissions, `@s` and feedback are what a real player gets. `--as-mode execute` runs `execute as <player> at <player> run ...` from the console instead.
- Checks results with vanilla `execute if/unless ...` conditions (scoreboard, blocks, entities, teams, tags), regexes on chat feedback, and prints scoreboard / entity-count / chat snapshots.
- Reports the failing **script line numbers** and how many seconds the test run took (server start and player join are timed separately).
- Exit code `0` all passed, `1` some failed, `2` setup error. `--json` and `--out <dir>` (report.md) for machines.

## Pre-flight lint

Before running `mctestbed run <script>`, the tool automatically runs `mctestbed lint <script> --mc <version>` to check the script against the version's grammar table. `mctestbed lint <script> --mc <version>` checks gamerule names (e.g. `doDaylightCycle` works in 1.20.1 but a renamed game rule is needed in 1.21.11) and item component syntax (`[...]` after item IDs works from 1.20.5 onward; earlier versions require the NBT form `minecraft:item{...}`). Scripts that pass lint will have fewer unexpected failures on the server.

## Quick start

Requirements: Node.js 20+, Java 21+ (for Minecraft 1.21.x).

```sh
git clone https://github.com/Y0ssh1i/mc-command-testbed
cd mc-command-testbed
npm install
node bin/mctestbed.js run examples/three-players.mcfunction --accept-eula
```

The first run downloads the server jar (about 54 MB). A run takes roughly 10 to 15 seconds, mostly the server starting.

## Script format

A script is a `.mcfunction`-style file: every line that is not a directive is a plain command (a leading `/` is optional). Directives start with `#@`.

```mcfunction
#@ players Alice Bob Carol        # who joins (otherwise --players N, default 3)
scoreboard objectives add pts dummy      # runs from the console by default
#@ as Alice                       # the next commands run as Alice, until the next "#@ as"
give @s minecraft:diamond 3
scoreboard players add @s pts 5
#@ expect Alice /Added 5 to \[pts\]/     # chat feedback since the last command must match
#@ as console
#@ wait 500ms                      # 1s, 20t (ticks), 500ms
#@ assert if score Alice pts matches 5   # "execute if ..." must say "Test passed"
#@ assert unless entity @e[type=zombie]
#@ expect-fail                     # the NEXT command must fail
scoreboard players get Nobody pts
#@ show scores                     # also: show entity <selector>, show chat <player>
```

| Directive | Meaning |
|---|---|
| `#@ players A B C` | Players to bring in (3 to 16 letters, digits or `_`). |
| `#@ as <player\|console>` | Who runs the following commands. |
| `#@ wait <n>[ms\|s\|t]` | Sleep. |
| `#@ assert if\|unless <condition>` | Runs `execute <condition>`; passes on "Test passed". |
| `#@ expect <player> /regex/` | Feedback that player received since the last command (chat mode only). |
| `#@ expect-output /regex/` | Output of the last command. |
| `#@ expect-fail` | The next command is expected to fail (passes when it does). |
| `#@ show scores` / `show entity <sel>` / `show chat <player>` | Snapshot into the report. |

`mctestbed check <script>` only parses the script and prints bad directive lines.

## Using it with Claude (experimental, not automated yet)

The JSON report is meant to close a loop: ask Claude to write the commands for your idea, run `mctestbed run script.mcfunction --accept-eula --json`, hand the failing lines and their output back, repeat. Today you drive that loop by hand; [docs/claude-loop.md](docs/claude-loop.md) has a prompt that works with it.

## Limits (v0.1)

- Java Edition only, two tested versions (1.20.1, 1.21.11). Bedrock Edition is not supported.
- Failure detection for console and `execute` mode uses known vanilla error phrases (RCON has no colour). Chat mode also uses red text. A failure with an unusual message can slip through: add an `assert`.
- Game rules and command syntax change between versions (for example `doDaylightCycle` became a renamed game rule in 1.21.11, and the tool reports the old name as a failed line). Scripts are tied to the version you run.
- Not a load tester. Use SoulFire or mc-bots for that.
- No demo video yet.

## Tests

```sh
npm test                                                  # unit tests, no Minecraft needed
MCTESTBED_E2E=1 MCTESTBED_ACCEPT_EULA=1 MCTESTBED_E2E_VERSIONS="1.20.1,1.21.11" npm test         # also runs the examples on a real server for 1.20.1 and 1.21.11
```

The CI workflow runs the unit tests on every push. The real-server job runs only when started by hand.

## Legal

MIT licensed (see [LICENSE](LICENSE)). Not affiliated with Mojang or Microsoft. "Minecraft" is a trademark of Mojang. This project contains no Minecraft code or assets.
