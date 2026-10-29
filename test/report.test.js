import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, renderText, renderMarkdown } from '../src/report.js';
import { hasRed, defaultPlayers } from '../src/runner.js';

const results = [
  { line: 3, actor: 'Alice', text: 'give @s stone', status: 'PASS', ms: 40, output: 'Gave 1 [Stone] to Alice' },
  { line: 4, actor: 'Bob', text: 'oops', status: 'FAIL', ms: 12, output: 'Unknown or incomplete command' },
];
const report = { script: 't.mcfunction', version: '1.21.11', players: ['Alice', 'Bob'], results, shows: [],
  summary: summarize(results), timing: { serverStartMs: 9000, joinMs: 2000, runMs: 52, totalMs: 12000 } };

test('summary lists failed script lines', () => {
  assert.deepEqual(report.summary, { steps: 2, passed: 1, failed: 1, failedLines: [4] });
});

test('text and markdown reports name the failed line and timing', () => {
  const t = renderText(report);
  assert.match(t, /1\/2 steps passed, 1 failed \(script lines: 4\)/);
  assert.match(t, /test run: 0\.1s/);
  assert.match(renderMarkdown(report), /\| 4 \| Bob \| `oops` \| FAIL \|/);
});

test('red text anywhere in a chat component marks a failure', () => {
  assert.ok(hasRed({ text: '', extra: [{ text: 'x', color: 'red' }] }));
  assert.ok(!hasRed({ text: 'ok', color: 'white' }));
  assert.deepEqual(defaultPlayers(4), ['Alice', 'Bob', 'Carol', 'Dave']);
});
