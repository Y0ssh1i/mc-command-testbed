# Loop with Claude (manual for now)

1. Ask Claude for a script. Give it the script format from the README and the Minecraft version.

   > Write a `.mcfunction`-style test script for Minecraft Java 1.21.11. Use `#@ players`, `#@ as <player>` to choose who runs each command, and `#@ assert if ...` for every claim. Idea: *(describe your minigame)*.

2. Run it and keep the machine-readable report:

   ```sh
   mctestbed run idea.mcfunction --accept-eula --json --out runs/last
   ```

3. Give Claude the report JSON (or only the rows whose `status` is `FAIL` or `ERROR`) and ask for a fixed script. Each row has the script `line`, the `actor`, the `text`, and the server's `output`.

4. Repeat until `summary.failed` is `0`.

Notes:

- Check the result yourself. The table says which commands ran and which assertions held. It does not say the idea is fun.
- Scripts are tied to the version: tell Claude which one you run.
- Automating this loop (Claude Code calling `mctestbed` and editing the script until green) is planned, not built.
