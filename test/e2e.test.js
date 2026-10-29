// Needs Java 21, network access to Mojang, and an explicit EULA acceptance:
//   MCTESTBED_E2E=1 MCTESTBED_ACCEPT_EULA=1 npm test                 # default version
//   MCTESTBED_E2E=1 MCTESTBED_ACCEPT_EULA=1 MCTESTBED_E2E_VERSIONS="1.20.1,1.21.11" npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fetchServer } from '../src/fetch-server.js';
import { runScript } from '../src/runner.js';
import { loadVersionTable, lintScript } from '../src/versions.js';

const VERSIONS = (process.env.MCTESTBED_E2E_VERSIONS || '1.21.11').split(/[\s,]+/).filter(Boolean);
const on = process.env.MCTESTBED_E2E === '1' && process.env.MCTESTBED_ACCEPT_EULA === '1';
const workDir = path.join(os.tmpdir(), 'mctestbed-e2e');

// Script -> the script lines that are expected to fail on a fresh server.
const CASES = {
  'three-players.mcfunction': { failedLines: [], players: 3 },
  'broken.mcfunction': { failedLines: [6, 9], players: 2 },
  'everyone-joins-a-team.mcfunction': { failedLines: [], players: 3 },
  'gamerule-names-1.21.11.mcfunction': { failedLines: [], players: 1, only: '1.21.11' },
  'gamerule-names-1.20.1.mcfunction': { failedLines: [], players: 1, only: '1.20.1' },
};

for (const version of VERSIONS) {
  for (const [script, expected] of Object.entries(CASES)) {
    if (expected.only && expected.only !== version) continue;
    test(`${script} on ${version} reports exactly the failing script lines`, { skip: !on, timeout: 300000 }, async () => {
      const jar = await fetchServer(version);
      // The pre-flight lint must not complain about a script written for this version.
      const findings = lintScript(
        await (await import('node:fs/promises')).readFile(path.resolve('examples', script), 'utf8'),
        loadVersionTable(version),
      );
      assert.deepEqual(findings.map((f) => f.line), [], `lint on ${version}: ${JSON.stringify(findings)}`);
      const report = await runScript({
        scriptPath: path.resolve('examples', script), version, jar, acceptEula: true,
        playerCount: expected.players, workDir,
      });
      assert.deepEqual(report.summary.failedLines, expected.failedLines,
        JSON.stringify(report.results.filter((r) => r.status !== 'PASS')));
      assert.equal(report.players.length, expected.players);
    });
  }
}
