// Result table (plain text + Markdown + JSON).
const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const clip = (s, n) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '...' : one;
};

export function summarize(results) {
  const failed = results.filter((r) => r.status === 'FAIL' || r.status === 'ERROR');
  return {
    steps: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: failed.length,
    failedLines: failed.map((r) => r.line),
  };
}

export function renderText(report) {
  const rows = report.results.map((r) => [
    String(r.line), r.actor ?? '-', clip(r.text, 44), r.status, `${r.ms}ms`, clip(r.output, 48),
  ]);
  const head = ['line', 'as', 'step', 'result', 'time', 'output'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  const out = [fmt(head), widths.map((w) => '-'.repeat(w)).join('  ')];
  for (const r of rows) out.push(fmt(r));
  const s = report.summary;
  const t = report.timing;
  out.push('');
  out.push(`${s.passed}/${s.steps} steps passed, ${s.failed} failed${s.failed ? ` (script lines: ${s.failedLines.join(', ')})` : ''}`);
  out.push(`test run: ${(t.runMs / 1000).toFixed(1)}s  (server start: ${(t.serverStartMs / 1000).toFixed(1)}s, players joined: ${(t.joinMs / 1000).toFixed(1)}s, total: ${(t.totalMs / 1000).toFixed(1)}s)`);
  for (const sh of report.shows ?? []) {
    out.push('');
    out.push(`[show ${sh.what}${sh.arg ? ' ' + sh.arg : ''}] (line ${sh.line})`);
    for (const l of sh.lines) out.push('  ' + l);
  }
  return out.join('\n');
}

export function renderMarkdown(report) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const out = [
    `# Test run: ${report.script}`, '',
    `Minecraft ${report.version}, players: ${report.players.join(', ')}`, '',
    '| line | as | step | result | time | output |', '|---|---|---|---|---|---|',
  ];
  for (const r of report.results) {
    out.push(`| ${r.line} | ${esc(r.actor ?? '-')} | \`${esc(clip(r.text, 60))}\` | ${r.status} | ${r.ms}ms | ${esc(clip(r.output, 70))} |`);
  }
  const s = report.summary;
  out.push('', `**${s.passed}/${s.steps} passed, ${s.failed} failed.** Run took ${(report.timing.runMs / 1000).toFixed(1)}s (total ${(report.timing.totalMs / 1000).toFixed(1)}s).`);
  for (const sh of report.shows ?? []) {
    out.push('', `### show ${sh.what} ${sh.arg}`.trimEnd(), '', '```', ...sh.lines, '```');
  }
  return out.join('\n') + '\n';
}
