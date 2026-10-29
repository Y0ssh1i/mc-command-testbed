// Downloads the official server.jar for one Minecraft version straight from Mojang
// into a local cache. The jar is never bundled with or redistributed by this project.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export function cacheRoot() {
  return process.env.MCTESTBED_HOME || path.join(os.homedir(), '.mctestbed');
}

export function jarPath(version) {
  return path.join(cacheRoot(), 'servers', version, 'server.jar');
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}

export async function fetchServer(version, log = () => {}) {
  const dest = jarPath(version);
  if (fs.existsSync(dest)) return dest;
  log(`looking up ${version} in the official Mojang version manifest`);
  const manifest = await getJson(MANIFEST);
  const entry = manifest.versions.find((v) => v.id === version);
  if (!entry) throw new Error(`unknown Minecraft version: ${version}`);
  const meta = await getJson(entry.url);
  const dl = meta.downloads?.server;
  if (!dl) throw new Error(`no dedicated server download for ${version}`);
  log(`downloading server.jar (${(dl.size / 1048576).toFixed(1)} MB) from Mojang`);
  const r = await fetch(dl.url);
  if (!r.ok) throw new Error(`GET ${dl.url} -> ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
  if (sha1 !== dl.sha1) throw new Error(`sha1 mismatch for server.jar (${sha1} != ${dl.sha1})`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  log(`saved ${dest} (sha1 verified)`);
  return dest;
}
