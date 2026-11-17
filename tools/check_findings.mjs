#!/usr/bin/env node
// Check an outside reviewer's findings against the pages they say they are about.
//
//   node tools/check_findings.mjs <findings.json> [packet.md]
//
// Each finding quotes the words it is about and names their page. A quote that is not on its
// page is listed and the command exits 1: that finding is about something the site does not
// say. With no packet given, the review build is made afresh, so findings are checked
// against the site as it stands and not as it stood when the reviewer read it.
// Passing this check says a finding points at real words. It does not say the finding is right.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';
import { SiteError, loadSite } from '../src/lib/model.mjs';
import { checkFindings, packet, packetPages } from '../src/lib/packet.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [findingsPath, packetPath] = process.argv.slice(2);
if (!findingsPath) {
  console.error('usage: node tools/check_findings.mjs <findings.json> [packet.md]');
  process.exit(2);
}
try {
  let text;
  if (packetPath) text = readFileSync(packetPath, 'utf8');
  else {
    const dir = mkdtempSync(join(tmpdir(), 'fwu-packet-'));
    const report = build({ root, outDir: dir, channel: 'review' });
    text = packet(report, (file) => readFileSync(join(dir, file), 'utf8'), { site: loadSite(root), date: new Date().toISOString().slice(0, 10) });
  }
  let findings;
  try {
    findings = JSON.parse(readFileSync(findingsPath, 'utf8'));
  } catch (error) {
    console.error(`${findingsPath} is not JSON: ${error.message}`);
    process.exit(2);
  }
  const { rows, errors } = checkFindings(findings, packetPages(text));
  for (const line of errors) console.log(`  - ${line}`);
  const bad = rows.filter((row) => !row.ok);
  for (const row of bad) console.log(`  ${row.id} (page ${row.page}): ${row.problems.join('; ')}`);
  console.log(`${rows.length} findings: ${rows.length - bad.length} point at words that are on the page they name, ${bad.length} do not or are incomplete.`);
  process.exit(errors.length || bad.length ? 1 : 0);
} catch (error) {
  console.error(error instanceof SiteError ? error.message : error);
  process.exit(1);
}
