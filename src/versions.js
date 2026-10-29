// Per-version grammar tables (versions/<version>.yaml) and the pre-flight lint
// that runs before a script is played on a server.
//
// The tables are plain data: adding a Minecraft version means adding one file,
// versions/<version>.yaml. Nothing here is version-specific code.
//
// The YAML subset understood here is deliberately small:
//   key: "value" | 'value' | bare number/boolean/word
//   key:                       followed by "- item" lines, or by "- key: value"
//                             lines whose following indented "key: value" lines
//                             belong to the same list entry.
//   # comment                  to end of line
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function unquote(raw) {
  const t = String(raw).trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return { value: t.slice(1, -1), quoted: true };
  }
  return { value: t, quoted: false };
}

function scalar(raw) {
  const { value, quoted } = unquote(raw);
  if (quoted) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

// Parse the small YAML subset described above. Throws on a line it cannot read.
export function parseVersionTable(text) {
  const root = {};
  let listKey = null;   // key of the list currently being filled
  let item = null;      // current "- ..." entry (object or null for a plain string)
  const lines = String(text).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const noComment = raw.replace(/\s+#.*$/, '');
    const line = noComment.trimEnd();
    if (!line.trim()) return;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (body.startsWith('#')) return;
    if (indent === 0) {
      listKey = null; item = null;
      const m = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(body);
      if (!m) throw new Error(`versions yaml line ${i + 1}: expected "key: value": ${body}`);
      const [, key, value] = m;
      if (value === undefined || value === '') { root[key] = []; listKey = key; }
      else root[key] = scalar(value);
      return;
    }
    if (!listKey) throw new Error(`versions yaml line ${i + 1}: unexpected indentation: ${body}`);
    if (body.startsWith('- ') || body === '-') {
      const rest = body.slice(1).trim();
      const m = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(rest);
      if (m) { item = { [m[1]]: m[2] === undefined || m[2] === '' ? null : scalar(m[2]) }; root[listKey].push(item); }
      else { item = null; root[listKey].push(scalar(rest)); }
      return;
    }
    if (!item) throw new Error(`versions yaml line ${i + 1}: expected "- key: value": ${body}`);
    const m = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(body);
    if (!m) throw new Error(`versions yaml line ${i + 1}: expected "key: value": ${body}`);
    item[m[1]] = m[2] === undefined || m[2] === '' ? null : scalar(m[2]);
  });
  return root;
}

// Where the table files live: <repo>/versions/<version>.yaml.
export function versionsDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'versions');
}

export function tablePath(version, dir = versionsDir()) {
  return path.join(dir, `${version}.yaml`);
}

export function loadVersionTable(version, dir = versionsDir()) {
  const file = tablePath(version, dir);
  if (!fs.existsSync(file)) return null;
  const table = parseVersionTable(fs.readFileSync(file, 'utf8'));
  return { file, version, ...table };
}

export function listVersions(dir = versionsDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -'.yaml'.length)).sort();
}

const ITEM_COMMAND = /^\s*(give|item|clear|summon|setblock\s+\S+)\b/;

// Check a script against one version table. Returns one entry per finding:
// { line, id, message, because }. Warnings only: the run itself still decides
// pass/fail, the lint just says "this line will probably not work here".
export function lintScript(text, table) {
  const out = [];
  if (!table) return out;
  const aliases = (table.gamerule_aliases ?? []).filter((a) => a && a.name && a.here);
  const byName = new Map(aliases.map((a) => [a.name, a]));
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const command = line.replace(/^\//, '');
    const gm = /^gamerule\s+([A-Za-z0-9_]+)/.exec(command);
    if (gm) {
      // "here" is the name that works in this version; anything listed under
      // "name" in this table is the other side of a rename and will not work.
      const a = byName.get(gm[1]);
      if (a) out.push({ line: lineNo, id: 'gamerule-name', message: `gamerule ${gm[1]} does not exist in ${table.version}: use ${a.here}`, because: a.because ?? 'renamed between versions' });
      // Names that exist only in another version (added or removed later).
      const miss = (table.gamerule_missing ?? []).find((m) => m && m.name === gm[1]);
      if (miss && !a) out.push({ line: lineNo, id: 'gamerule-name', message: `gamerule ${gm[1]} does not exist in ${table.version}`, because: miss.because ?? 'added or removed between versions' });
      return;
    }
    if (table.item_component_syntax === false) {
      const im = /^([A-Za-z0-9_:]+)\[/.exec(command.replace(/^[a-z]+\s+(?:[^\s]+\s+)?/, ''));
      const looksLikeItem = ITEM_COMMAND.test(command) || /\bminecraft:/.test(command);
      if (im && looksLikeItem) {
        out.push({ line: lineNo, id: 'item-components', message: `${im[1]}[...] component syntax does not work in ${table.version}`, because: table.item_components_because ?? 'data component syntax exists from 1.20.5' });
      }
    }
  });
  return out;
}

// Render findings the way `check` does: one line each, nothing on stdout for
// scripts with no table or no findings.
export function renderLint(findings, table, version) {
  if (!table) return `no grammar table for ${version}: add versions/${version}.yaml to get this check`;
  if (!findings.length) return `version ${table.version}: grammar check found nothing to fix`;
  return [`version ${table.version}: ${findings.length} line(s) to check before running`,
    ...findings.map((f) => `line ${f.line}: [${f.id}] ${f.message} (${f.because})`)].join('\n');
}
