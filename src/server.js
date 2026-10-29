// Starts a throw-away vanilla server bound to localhost only (offline mode, so the
// fake players need no accounts). Nothing here ever connects to an outside server.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

// Reserve several distinct free localhost ports at once (holding every socket until all are
// chosen, so two calls can never hand back the same port).
export async function freePorts(n) {
  const socks = [];
  try {
    for (let i = 0; i < n; i++) {
      const s = net.createServer();
      await new Promise((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
      socks.push(s);
    }
    return socks.map((s) => s.address().port);
  } finally {
    await Promise.all(socks.map((s) => new Promise((r) => s.close(r))));
  }
}

export function buildProperties({ port, rconPort, rconPassword, maxPlayers }) {
  return [
    'online-mode=false',
    'server-ip=127.0.0.1',
    `server-port=${port}`,
    'enable-rcon=true',
    `rcon.port=${rconPort}`,
    `rcon.password=${rconPassword}`,
    'broadcast-rcon-to-ops=false',
    'level-type=minecraft:flat',
    'generate-structures=false',
    'gamemode=creative',
    'force-gamemode=true',
    'difficulty=easy',
    'spawn-protection=0',
    'spawn-monsters=false',
    'spawn-animals=false',
    'spawn-npcs=false',
    'view-distance=3',
    'simulation-distance=3',
    `max-players=${maxPlayers}`,
    'white-list=false',
    'enforce-whitelist=false',
    'enable-status=false',
    'sync-chunk-writes=false',
    'op-permission-level=4',
    'function-permission-level=4',
    'motd=mc-command-testbed (local only)',
    '',
  ].join('\n');
}

export async function startServer({ jar, dir, java = 'java', xmx = '1G', maxPlayers = 8, acceptEula, log = () => {} }) {
  if (!acceptEula) {
    throw new Error('You must accept the Minecraft EULA (https://aka.ms/MinecraftEULA) to run the server. Re-run with --accept-eula.');
  }
  fs.mkdirSync(dir, { recursive: true });
  const [port, rconPort] = await freePorts(2);
  const rconPassword = crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n');
  fs.writeFileSync(path.join(dir, 'server.properties'), buildProperties({ port, rconPort, rconPassword, maxPlayers }));

  const child = spawn(java, [`-Xmx${xmx}`, '-Xms256m', '-jar', path.resolve(jar), 'nogui'], {
    cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let lines = '';
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not finish starting in 120s\n' + lines.slice(-1500))), 120000);
    const onData = (d) => {
      const s = d.toString();
      lines += s;
      // RCON starts listening slightly after "Done", so wait for both lines.
      if (/\]: Done \(/.test(lines) && /RCON running on/.test(lines)) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { lines += d.toString(); });
    child.once('error', (e) => { clearTimeout(timer); reject(new Error(`could not start java (${java}): ${e.message}`)); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited early (code ${code})\n` + lines.slice(-1500))); });
  });
  log(`server pid ${child.pid}, localhost:${port} (offline mode, rcon on localhost:${rconPort})`);
  await ready;

  return {
    port, rconPort, rconPassword, pid: child.pid,
    getLog: () => lines,
    async stop(rcon) {
      try { await Promise.race([rcon?.command('stop'), new Promise((r) => setTimeout(r, 3000))]); } catch { /* ignore */ }
      const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 15000))]);
      if (code === 'timeout') { try { process.kill(child.pid); } catch { /* already gone */ } await exited; }
    },
  };
}
