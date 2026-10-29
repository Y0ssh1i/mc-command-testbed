import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { encodePacket, decodePackets, Rcon } from '../src/rcon.js';

test('packet round trip, split across chunks', () => {
  const a = encodePacket(7, 2, 'list');
  const b = encodePacket(8, 0, 'There are 0 of a max of 20 players online:');
  const all = Buffer.concat([a, b]);
  const first = decodePackets(all.subarray(0, a.length + 5));
  assert.deepEqual(first.packets, [{ id: 7, type: 2, body: 'list' }]);
  const second = decodePackets(Buffer.concat([first.rest, all.subarray(a.length + 5)]));
  assert.equal(second.packets[0].body, 'There are 0 of a max of 20 players online:');
  assert.equal(second.rest.length, 0);
});

test('client authenticates and runs a command against a fake server', async () => {
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const { packets, rest } = decodePackets(buf);
      buf = rest;
      for (const p of packets) {
        if (p.type === 3) sock.write(encodePacket(p.body === 'bad' ? -1 : p.id, 2, ''));
        else if (p.type === 2) sock.write(encodePacket(p.id, 0, `echo:${p.body}`));
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const rcon = new Rcon({ port: server.address().port, password: 'pw' });
  await rcon.connect();
  assert.equal(await rcon.command('say hi'), 'echo:say hi');
  rcon.close();
  server.close();
});
