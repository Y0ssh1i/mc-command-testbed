import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, parseDuration, looksFailed } from '../src/script.js';

test('commands keep their line numbers and the current actor', () => {
  const { players, steps } = parseScript('#@ players Alice Bob\n# note\n\n#@ as Alice\n/give @s stone\n#@ as console\nsay hi\n');
  assert.deepEqual(players, ['Alice', 'Bob']);
  assert.equal(steps.length, 2);
  assert.deepEqual([steps[0].line, steps[0].actor, steps[0].command], [5, 'Alice', 'give @s stone']);
  assert.deepEqual([steps[1].line, steps[1].actor], [7, 'console']);
});

test('directives: wait, assert, expect, expect-output, show', () => {
  const { steps } = parseScript(['#@ wait 2t', '#@ assert if score A x matches 1', '#@ expect A /ok/i', '#@ expect-output /Done/', '#@ show scores', '#@ show entity @e[type=pig]'].join('\n'));
  assert.deepEqual(steps.map((s) => s.kind), ['wait', 'assert', 'expect', 'expect-output', 'show', 'show']);
  assert.equal(steps[0].ms, 100);
  assert.ok(steps[2].regex.test('OK'));
  assert.equal(steps[5].arg, '@e[type=pig]');
});

test('expect-fail applies to the next command only', () => {
  const { steps } = parseScript('#@ expect-fail\nfoo\nbar\n');
  assert.deepEqual(steps.map((s) => s.expectFail), [true, false]);
});

test('bad directives become error steps with the line number', () => {
  const { steps } = parseScript('#@ players a\n#@ wait soon\n#@ assert score x\n#@ nope\n#@ expect A ok\n');
  assert.deepEqual(steps.map((s) => [s.kind, s.line]), [['error', 1], ['error', 2], ['error', 3], ['error', 4], ['error', 5]]);
});

test('durations', () => {
  assert.equal(parseDuration('1s'), 1000);
  assert.equal(parseDuration('500ms'), 500);
  assert.equal(parseDuration('20t'), 1000);
  assert.throws(() => parseDuration('x'));
});

test('failure heuristics match vanilla feedback', () => {
  assert.ok(looksFailed('Unknown or incomplete command. See below for error'));
  assert.ok(looksFailed('give @s foo<--[HERE]'));
  assert.ok(looksFailed("Can't get value of pts for Nobody; none is set"));
  assert.ok(!looksFailed('Gave 3 [Diamond] to Alice'));
  assert.ok(!looksFailed(''));
});
