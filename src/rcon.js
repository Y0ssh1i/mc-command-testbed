// Minimal RCON client (Source RCON protocol, as used by the Minecraft server).
import net from 'node:net';

export function encodePacket(id, type, body) {
  const payload = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  return buf; // two trailing zero bytes already zero-filled
}

// Pull complete packets out of a buffer. Returns { packets, rest }.
export function decodePackets(buffer) {
  const packets = [];
  let off = 0;
  while (buffer.length - off >= 4) {
    const len = buffer.readInt32LE(off);
    if (buffer.length - off < 4 + len) break;
    const id = buffer.readInt32LE(off + 4);
    const type = buffer.readInt32LE(off + 8);
    const body = buffer.toString('utf8', off + 12, off + 4 + len - 2);
    packets.push({ id, type, body });
    off += 4 + len;
  }
  return { packets, rest: buffer.subarray(off) };
}

export class Rcon {
  constructor({ host = '127.0.0.1', port, password }) {
    this.host = host; this.port = port; this.password = password;
    this.nextId = 1; this.pending = new Map(); this.buf = Buffer.alloc(0);
  }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port });
      this.sock = sock;
      const timer = setTimeout(() => { sock.destroy(); reject(new Error('rcon connect timeout')); }, timeoutMs);
      sock.on('data', (d) => this.#onData(d));
      sock.on('error', (e) => { clearTimeout(timer); reject(e); });
      sock.on('close', () => { for (const p of this.pending.values()) p.reject(new Error('rcon closed')); this.pending.clear(); });
      sock.on('connect', async () => {
        try {
          const r = await this.#send(3, this.password);
          clearTimeout(timer);
          if (r.id === -1) reject(new Error('rcon auth failed')); else resolve();
        } catch (e) { clearTimeout(timer); reject(e); }
      });
    });
  }

  #onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    const { packets, rest } = decodePackets(this.buf);
    this.buf = rest;
    for (const p of packets) {
      const w = this.pending.get(p.id) ?? (p.id === -1 ? this.pending.values().next().value : undefined);
      if (w) { this.pending.delete(w.id); w.resolve(p); }
    }
  }

  #send(type, body) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { id, resolve, reject });
      this.sock.write(encodePacket(id, type, body));
    });
  }

  async command(cmd) {
    const p = await this.#send(2, cmd);
    return p.body;
  }

  close() { try { this.sock?.destroy(); } catch { /* ignore */ } }
}
