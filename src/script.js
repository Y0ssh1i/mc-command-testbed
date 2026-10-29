// Script format (.mcfunction-compatible: every non-directive line is a plain command).
//
//   # comment                       ignored
//   #@ players Alice Bob Carol      players to bring in (default: from the CLI, 3)
//   #@ as Alice                     following commands run as Alice (until the next #@ as)
//   #@ as console                   following commands run from the server console (default)
//   give @s diamond 3               a command (no leading slash needed)
//   #@ wait 1s                      wait (also: 20t = ticks, 500ms)
//   #@ assert if score Alice pts matches 3     passes if `execute if score ...` succeeds
//   #@ assert unless entity @e[type=zombie]
//   #@ expect Alice /Gave 3/        the last command's feedback to Alice must match the regex
//   #@ expect-output /regex/        the last command's console output must match the regex
//   #@ expect-fail                  the NEXT command is expected to fail
//   #@ show scores | show entity <selector> | show chat <player>

export function parseDuration(text) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|t)?$/.exec(text.trim());
  if (!m) throw new Error(`bad duration: ${text}`);
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  return unit === 'ms' ? n : unit === 't' ? n * 50 : n * 1000;
}

function parseRegex(text) {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(text.trim());
  if (!m) throw new Error(`regex must look like /pattern/ : ${text}`);
  return new RegExp(m[1], m[2]);
}

// Returns { players: string[]|null, steps: Step[] }. Never throws on a bad line:
// the bad line becomes a step of kind 'error' so the report can point at it.
export function parseScript(text) {
  const steps = [];
  let players = null;
  let actor = 'console';
  let expectFail = false;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#@')) {
      const body = line.slice(2).trim();
      const sp = body.indexOf(' ');
      const key = sp < 0 ? body : body.slice(0, sp);
      const arg = sp < 0 ? '' : body.slice(sp + 1).trim();
      try {
        switch (key) {
          case 'players':
            players = arg.split(/[\s,]+/).filter(Boolean);
            if (!players.length) throw new Error('players needs at least one name');
            for (const p of players) if (!/^\w{3,16}$/.test(p)) throw new Error(`bad player name: ${p}`);
            break;
          case 'as': actor = arg || 'console'; break;
          case 'wait': steps.push({ kind: 'wait', line: lineNo, ms: parseDuration(arg), text: line }); break;
          case 'assert': {
            if (!/^(if|unless)\s/.test(arg)) throw new Error('assert must start with "if" or "unless"');
            steps.push({ kind: 'assert', line: lineNo, cond: arg, text: line });
            break;
          }
          case 'expect': {
            const m = /^(\S+)\s+(\/.*\/[a-z]*)$/s.exec(arg);
            if (!m) throw new Error('expect <player> /regex/');
            steps.push({ kind: 'expect', line: lineNo, player: m[1], regex: parseRegex(m[2]), text: line });
            break;
          }
          case 'expect-output': steps.push({ kind: 'expect-output', line: lineNo, regex: parseRegex(arg), text: line }); break;
          case 'expect-fail': expectFail = true; break;
          case 'show': {
            const m = /^(scores|entity|chat)\s*(.*)$/.exec(arg);
            if (!m) throw new Error('show scores | show entity <selector> | show chat <player>');
            steps.push({ kind: 'show', line: lineNo, what: m[1], arg: m[2], text: line });
            break;
          }
          default: throw new Error(`unknown directive: ${key}`);
        }
      } catch (e) {
        steps.push({ kind: 'error', line: lineNo, text: line, message: e.message });
      }
      return;
    }
    if (line.startsWith('#')) return;
    steps.push({ kind: 'command', line: lineNo, actor, command: line.replace(/^\//, ''), text: line, expectFail });
    expectFail = false;
  });
  return { players, steps };
}

// Heuristics for vanilla failure feedback (RCON gives plain text, chat gives colour too).
const FAIL_PATTERNS = [
  /^Unknown or incomplete command/,
  /<--\[HERE\]/,
  /^Incorrect argument for command/,
  /^Expected /,
  /^No (entity|player|block|score|objective)\b.*(was|were) found/i,
  /^Could not /,
  /^Can't /,
  /^Nothing changed/,
  /^That position is not loaded/,
  /^Unknown (scoreboard|objective|team|item|block|entity|effect)/i,
  /^An unexpected error occurred/,
  /^You do not have permission/i,
  /^I'm sorry, Dave/,
];

export function looksFailed(output) {
  const t = (output ?? '').trim();
  return t.split(/\r?\n/).some((l) => FAIL_PATTERNS.some((p) => p.test(l.trim())));
}
