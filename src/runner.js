import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import mineflayer from 'mineflayer';
import { Rcon } from './rcon.js';
import { parseScript, looksFailed } from './script.js';
import { startServer } from './server.js';
import { jarPath } from './fetch-server.js';
import { summarize } from './report.js';

const DEFAULT_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

export function defaultPlayers(n) {
  return Array.from({ length: n }, (_, i) => DEFAULT_NAMES[i] ?? `Player${i + 1}`);
}

// Failure feedback in vanilla is red text; look through the whole component tree.
export function hasRed(json) {
  if (!json || typeof json !== 'object') return false;
  if (json.color === 'red') return true;
  const kids = [...(json.extra ?? []), ...(json.with ?? []), ...(Array.isArray(json) ? json : [])];
  return kids.some((k) => hasRed(k));
}

function joinBot({ name, port, version }) {
  return new Promise((resolve, reject) => {
    const bot = mineflayer.createBot({ host: '127.0.0.1', port, username: name, auth: 'offline', version, checkTimeoutInterval: 60000 });
    const messages = [];
    bot.on('message', (jsonMsg) => {
      const text = jsonMsg.toString();
      if (!text.startsWith('mctestbed-marker-')) messages.push({ text, red: hasRed(jsonMsg.json) });
    });
    const timer = setTimeout(() => reject(new Error(`${name} did not spawn in 30s`)), 30000);
    bot.once('spawn', () => { clearTimeout(timer); resolve({ bot, messages }); });
    bot.once('kicked', (r) => { clearTimeout(timer); reject(new Error(`${name} was kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`)); });
    bot.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

export async function runScript({ scriptPath, version = '1.21.11', playerCount = 3, acceptEula = false, asMode = 'chat',
  java = 'java', xmx = '1G', keepWorld = false, workDir, jar, log = () => {} }) {
  const t0 = now();
  const text = fs.readFileSync(scriptPath, 'utf8');
  const { players: scriptPlayers, steps } = parseScript(text);
  const players = scriptPlayers ?? defaultPlayers(playerCount);
  const runDir = path.join(workDir, `run-${Date.now()}`);
  const results = [];
  const shows = [];
  const bots = new Map();
  let server; let rcon;
  const timing = { serverStartMs: 0, joinMs: 0, runMs: 0, totalMs: 0 };
  try {
    const ts = now();
    server = await startServer({ jar: jar ?? jarPath(version), dir: runDir, java, xmx, maxPlayers: players.length + 2, acceptEula, log });
    rcon = new Rcon({ port: server.rconPort, password: server.rconPassword });
    await rcon.connect();
    timing.serverStartMs = now() - ts;

    const tj = now();
    for (const name of players) {
      const b = await joinBot({ name, port: server.port, version });
      bots.set(name, b);
      await rcon.command(`op ${name}`);
    }
    timing.joinMs = now() - tj;
    log(`${players.length} players joined: ${players.join(', ')}`);

    let markerSeq = 0;
    const windowStart = new Map(players.map((p) => [p, 0]));
    let lastOutput = '';

    // Run a command as a real player (chat packet) and collect what the player was told.
    async function asPlayerChat(name, command) {
      const b = bots.get(name);
      const start = b.messages.length;
      b.bot.chat(`/${command}`);
      await sleep(60); // let the packet reach the server before the marker
      const marker = `mctestbed-marker-${++markerSeq}`;
      const seen = new Promise((resolve) => {
        const h = (jsonMsg) => { if (jsonMsg.toString().includes(marker)) { b.bot.off('message', h); resolve(true); } };
        b.bot.on('message', h);
        setTimeout(() => { b.bot.off('message', h); resolve(false); }, 4000);
      });
      await rcon.command(`tellraw ${name} {"text":"${marker}"}`);
      const got = await seen;
      return { timedOut: !got, feedback: b.messages.slice(start) };
    }

    const tr = now();
    for (const step of steps) {
      const ts0 = now();
      const row = { line: step.line, actor: step.actor, text: step.text, status: 'PASS', output: '', ms: 0 };
      try {
        if (step.kind === 'error') {
          row.status = 'ERROR'; row.output = step.message;
        } else if (step.kind === 'wait') {
          await sleep(step.ms); row.actor = '-';
        } else if (step.kind === 'command') {
          for (const p of players) windowStart.set(p, bots.get(p).messages.length);
          let failed; let out;
          if (step.actor === 'console') {
            out = await rcon.command(step.command);
            failed = looksFailed(out);
          } else if (!bots.has(step.actor)) {
            row.status = 'ERROR'; row.output = `unknown player "${step.actor}" (players: ${players.join(', ')})`;
          } else if (asMode === 'execute') {
            out = await rcon.command(`execute as ${step.actor} at ${step.actor} run ${step.command}`);
            failed = looksFailed(out);
          } else {
            const r = await asPlayerChat(step.actor, step.command);
            out = r.feedback.map((m) => m.text).join(' / ');
            failed = r.feedback.some((m) => m.red) || looksFailed(out) || r.timedOut;
            if (r.timedOut) out = `(no reply from server within 4s) ${out}`;
          }
          if (row.status !== 'ERROR') {
            lastOutput = out ?? '';
            row.output = out || '(no feedback)';
            if (step.expectFail) {
              row.status = failed ? 'PASS' : 'FAIL';
              if (!failed) row.output = `expected this command to fail, but it succeeded: ${row.output}`;
            } else {
              row.status = failed ? 'FAIL' : 'PASS';
            }
          }
        } else if (step.kind === 'assert') {
          const out = await rcon.command(`execute ${step.cond}`);
          row.output = out;
          row.status = /^Test passed/.test(out.trim()) ? 'PASS' : 'FAIL';
          if (looksFailed(out)) row.status = 'ERROR';
        } else if (step.kind === 'expect') {
          if (asMode === 'execute') { row.status = 'ERROR'; row.output = 'expect <player> needs --as-mode chat (in execute mode feedback goes to the console: use expect-output)'; } else if (!bots.has(step.player)) { row.status = 'ERROR'; row.output = `unknown player "${step.player}"`; } else {
            const b = bots.get(step.player);
            const got = b.messages.slice(windowStart.get(step.player)).map((m) => m.text).join(' / ');
            row.output = got || '(nothing received)';
            row.status = step.regex.test(got) ? 'PASS' : 'FAIL';
          }
        } else if (step.kind === 'expect-output') {
          row.output = lastOutput || '(no output)';
          row.status = step.regex.test(lastOutput) ? 'PASS' : 'FAIL';
        } else if (step.kind === 'show') {
          const lines = await collectShow(rcon, bots, step);
          shows.push({ line: step.line, what: step.what, arg: step.arg, lines });
          row.output = `${lines.length} line(s) below`;
        }
      } catch (e) {
        row.status = 'ERROR'; row.output = e.message;
      }
      row.ms = Math.round(now() - ts0);
      results.push(row);
    }
    timing.runMs = now() - tr;
  } finally {
    for (const { bot } of bots.values()) { try { bot.quit(); } catch { /* ignore */ } }
    await sleep(200);
    if (server) await server.stop(rcon);
    rcon?.close();
    if (!keepWorld) { try { fs.rmSync(runDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    timing.totalMs = now() - t0;
  }
  return { script: path.basename(scriptPath), version, players, asMode, results, shows, summary: summarize(results), timing };
}

async function collectShow(rcon, bots, step) {
  if (step.what === 'scores') {
    const lines = [];
    const objs = await rcon.command('scoreboard objectives list');
    lines.push(`objectives: ${[...objs.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).join(', ') || '(none)'}`);
    const ents = await rcon.command('scoreboard players list');
    const names = ents.includes(':') ? ents.slice(ents.indexOf(':') + 1).split(',').map((s) => s.trim()).filter(Boolean) : [];
    for (const n of names) {
      const o = await rcon.command(`scoreboard players list ${n}`);
      const pairs = [...o.matchAll(/\[([^\]]+)\]:\s*(-?\d+)/g)].map((m) => `${m[1]}=${m[2]}`);
      lines.push(`${n}: ${pairs.join(' ') || '(no scores)'}`);
    }
    if (!names.length) lines.push('(no tracked entities)');
    return lines;
  }
  if (step.what === 'entity') {
    const out = await rcon.command(`execute if entity ${step.arg}`);
    const m = /count:\s*(\d+)/i.exec(out);
    return [`${step.arg} -> ${m ? m[1] : 0}`];
  }
  const b = bots.get(step.arg.trim());
  if (!b) return [`unknown player "${step.arg}"`];
  return b.messages.slice(-10).map((m) => `${m.red ? '[red] ' : ''}${m.text}`);
}
