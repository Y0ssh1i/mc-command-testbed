#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fetchServer, jarPath } from '../src/fetch-server.js';
import { runScript } from '../src/runner.js';
import { parseScript } from '../src/script.js';
import { renderText, renderMarkdown } from '../src/report.js';
import { loadVersionTable, lintScript, listVersions, renderLint } from '../src/versions.js';

const DEFAULT_VERSION = '1.21.11';
const USAGE = `mctestbed - run a command script on a local vanilla server with fake players

  mctestbed fetch-server [--mc ${DEFAULT_VERSION}]     download the official server.jar from Mojang (cached)
  mctestbed check <script>                         parse the script only (no server)
  mctestbed lint <script> [--mc <version>]         check the script against the grammar table of one version
  mctestbed run <script> [options]                 start the server, join the players, run the script

  Versions with a grammar table: ${listVersions().join(', ') || '(none)'}

run options:
  --mc <version>        Minecraft: Java Edition version (default ${DEFAULT_VERSION})
  --players <n>         number of fake players if the script has no "#@ players" line (default 3)
  --accept-eula         you accept the Minecraft EULA (https://aka.ms/MinecraftEULA); required
  --as-mode <chat|execute>  chat = commands go through the player's own chat packet (default),
                        execute = console "execute as <player> at <player> run ..."
  --out <dir>           write report.json and report.md there
  --json                print the report as JSON on stdout (logs go to stderr)
  --keep-world          keep the server folder after the run
  --xmx <size>          server memory (default 1G)
  --java <path>         java executable (Java 21 or newer)
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mc: { type: 'string', default: DEFAULT_VERSION },
    players: { type: 'string', default: '3' },
    'accept-eula': { type: 'boolean', default: false },
    'as-mode': { type: 'string', default: 'chat' },
    out: { type: 'string' },
    json: { type: 'boolean', default: false },
    'keep-world': { type: 'boolean', default: false },
    xmx: { type: 'string', default: '1G' },
    java: { type: 'string', default: 'java' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [cmd, arg] = positionals;
const log = (m) => console.error(`[mctestbed] ${m}`);

async function main() {
  if (values.help || !cmd) { console.log(USAGE); return cmd ? 0 : 2; }
  if (cmd === 'fetch-server') {
    await fetchServer(values.mc, log);
    console.log(jarPath(values.mc));
    return 0;
  }
  if (!arg) { console.error('script path missing\n'); console.error(USAGE); return 2; }
  if (cmd === 'check') {
    const { players, steps } = parseScript(fs.readFileSync(arg, 'utf8'));
    const bad = steps.filter((s) => s.kind === 'error');
    console.log(`${steps.length} steps, players: ${(players ?? ['(default)']).join(', ')}`);
    for (const b of bad) console.log(`line ${b.line}: ${b.message}  | ${b.text}`);
    return bad.length ? 1 : 0;
  }
  if (cmd === 'lint') {
    const script = fs.readFileSync(arg, 'utf8');
    const table = loadVersionTable(values.mc);
    const findings = lintScript(script, table);
    console.log(renderLint(findings, table, values.mc));
    return findings.length ? 1 : 0;
  }
  if (cmd === 'run') {
    if (!['chat', 'execute'].includes(values['as-mode'])) { console.error('--as-mode must be chat or execute'); return 2; }
    // Pre-flight: grammar differences for this version, before a server starts.
    const table = loadVersionTable(values.mc);
    const findings = lintScript(fs.readFileSync(arg, 'utf8'), table);
    for (const l of renderLint(findings, table, values.mc).split('\n').filter(Boolean)) log(`[lint] ${l}`);
    const jar = await fetchServer(values.mc, log);
    const workDir = path.resolve('.mctestbed', 'runs');
    const report = await runScript({
      scriptPath: arg, version: values.mc, playerCount: Number(values.players), acceptEula: values['accept-eula'],
      asMode: values['as-mode'], java: values.java, xmx: values.xmx, keepWorld: values['keep-world'], workDir, jar, log,
    });
    if (values.out) {
      fs.mkdirSync(values.out, { recursive: true });
      fs.writeFileSync(path.join(values.out, 'report.json'), JSON.stringify(report, (k, v) => (v instanceof RegExp ? String(v) : v), 2));
      fs.writeFileSync(path.join(values.out, 'report.md'), renderMarkdown(report));
    }
    if (values.json) console.log(JSON.stringify(report, (k, v) => (v instanceof RegExp ? String(v) : v), 2));
    else console.log(renderText(report));
    return report.summary.failed ? 1 : 0;
  }
  console.error(`unknown command: ${cmd}\n`); console.error(USAGE);
  return 2;
}

main().then((code) => process.exit(code), (e) => { console.error(`[mctestbed] error: ${e.message}`); process.exit(2); });
