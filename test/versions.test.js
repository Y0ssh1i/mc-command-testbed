import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseVersionTable, loadVersionTable, listVersions, lintScript, renderLint } from '../src/versions.js';

test('every shipped table parses and describes itself', () => {
  const versions = listVersions();
  assert.ok(versions.length >= 2, `expected tables for at least two versions, got ${versions.join(', ')}`);
  for (const v of versions) {
    const t = loadVersionTable(v);
    assert.ok(t, `no table for ${v}`);
    assert.equal(t.version, v);
    assert.ok(Number.isInteger(t.java) && t.java >= 17, `${v}: java version`);
    assert.ok(Array.isArray(t.notes) && t.notes.length, `${v}: notes`);
    for (const a of t.gamerule_aliases) {
      assert.ok(a.name && a.here && a.because, `${v}: alias needs name, here and because`);
    }
    for (const m of t.gamerule_missing ?? []) {
      assert.ok(m.name && m.because, `${v}: gamerule_missing needs name and because`);
    }
  }
});

test('table lists 1.20.1 and 1.21.11 with renamed game rules', () => {
  const old = parseVersionTable(fs.readFileSync(new URL('../versions/1.20.1.yaml', import.meta.url), 'utf8'));
  const neu = parseVersionTable(fs.readFileSync(new URL('../versions/1.21.11.yaml', import.meta.url), 'utf8'));
  assert.equal(old.item_component_syntax, false);
  assert.equal(neu.item_component_syntax, true);
  const find = (t, here) => t.gamerule_aliases.find((a) => a.here === here);
  assert.equal(find(old, 'doDaylightCycle').name, 'advance_time');
  assert.equal(find(neu, 'advance_time').name, 'doDaylightCycle');
});

test('lint points at the game rules that do not exist in that version', () => {
  const old = loadVersionTable('1.20.1');
  const neu = loadVersionTable('1.21.11');
  const script = ['# comment', 'gamerule advance_time false', '  /gamerule doDaylightCycle false', 'gamerule random_tick_speed 0', 'gamerule doFireTick false', 'gamerule spawnChunkRadius false'].join('\n');
  const onOld = lintScript(script, old);
  // advance_time and random_tick_speed are the new names; doFireTick and
  // spawnChunkRadius do exist in 1.20.1, so they stay quiet there.
  assert.deepEqual(onOld.map((f) => [f.line, f.id]), [[2, 'gamerule-name'], [4, 'gamerule-name']]);
  assert.match(onOld[0].message, /advance_time does not exist in 1\.20\.1: use doDaylightCycle/);
  assert.match(onOld[1].message, /random_tick_speed does not exist in 1\.20\.1: use randomTickSpeed/);
  const onNew = lintScript(script, neu);
  assert.deepEqual(onNew.map((f) => [f.line, f.id]), [[3, 'gamerule-name'], [5, 'gamerule-name'], [6, 'gamerule-name']]);
  assert.match(onNew[0].message, /doDaylightCycle does not exist in 1\.21\.11: use advance_time/);
  assert.match(onNew[1].message, /doFireTick does not exist in 1\.21\.11/);
  assert.match(onNew[2].message, /spawnChunkRadius does not exist in 1\.21\.11/);
});

test('lint keeps quiet on names that are fine in that version', () => {
  const script = 'give @s minecraft:diamond 3\nsummon minecraft:zombie ~3 ~ ~ {NoAI:1b}\nscoreboard players add @s pts 1\n';
  assert.deepEqual(lintScript(script, loadVersionTable('1.20.1')), []);
  assert.deepEqual(lintScript(script, loadVersionTable('1.21.11')), []);
  const fine = 'gamerule doDaylightCycle false\ngamerule randomTickSpeed 0\ngamerule maxEntityCramming 0\n';
  assert.deepEqual(lintScript(fine, loadVersionTable('1.20.1')), []);
  const fineNew = 'gamerule advance_time false\ngamerule random_tick_speed 0\ngamerule max_entity_cramming 0\n';
  assert.deepEqual(lintScript(fineNew, loadVersionTable('1.21.11')), []);
});

test('lint flags item component syntax on a version before 1.20.5', () => {
  const script = 'give @s minecraft:paper[minecraft:custom_name=\'{"text":"winner"}\'] 2\ngive @s minecraft:diamond 3\n';
  const onOld = lintScript(script, loadVersionTable('1.20.1'));
  assert.equal(onOld.length, 1);
  assert.equal(onOld[0].id, 'item-components');
  assert.equal(onOld[0].line, 1);
  assert.deepEqual(lintScript(script, loadVersionTable('1.21.11')), []);
});

test('renderLint says so when a version has no table', () => {
  assert.match(renderLint([], null, '1.7.10'), /no grammar table for 1\.7\.10/);
  assert.match(renderLint([], loadVersionTable('1.21.11')), /found nothing to fix/);
  const findings = lintScript('gamerule doDaylightCycle false', loadVersionTable('1.21.11'));
  assert.match(renderLint(findings, loadVersionTable('1.21.11')), /1 line\(s\) to check before running/);
});

test('parser rejects lines it does not understand', () => {
  assert.throws(() => parseVersionTable('just a bare word\n'));
  assert.throws(() => parseVersionTable('key: 1\n   orphan: 2\n'));
});

test('parser reads nested list entries and comments', () => {
  const t = parseVersionTable('# hello\nversion: "1.0"\njava: 17\nflag: true\ngamerule_aliases:\n  - name: A\n    here: B\n    because: "why"\n  - plain\n');
  assert.equal(t.version, '1.0');
  assert.equal(t.java, 17);
  assert.equal(t.flag, true);
  assert.deepEqual(t.gamerule_aliases, [{ name: 'A', here: 'B', because: 'why' }, 'plain']);
});
