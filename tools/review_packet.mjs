#!/usr/bin/env node
// One file with the words of every page, for a reviewer outside the site.
//
//   node tools/review_packet.mjs [--base https://where-the-review-site-is-served] [--out packet.md]
//
// It builds the review channel into a temporary folder and writes the packet to --out, or
// prints it. The packet holds only what the built pages say, so it names nothing the site
// does not. Hand it to a second reviewer with docs/OUTSIDE_REVIEW.md.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';
import { SiteError, loadSite } from '../src/lib/model.mjs';
import { packet } from '../src/lib/packet.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
try {
  const dir = mkdtempSync(join(tmpdir(), 'fwu-packet-'));
  const report = build({ root, outDir: dir, channel: 'review' });
  let commit = '';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // Not a git checkout: the packet says when it was made and not from what.
  }
  const text = packet(report, (file) => readFileSync(join(dir, file), 'utf8'), { site: loadSite(root), base: value('--base') || '', date: new Date().toISOString().slice(0, 10), commit });
  if (value('--out')) {
    writeFileSync(value('--out'), text);
    console.log(`${report.pages.filter((page) => page.shipped).length} pages, ${text.split(/\s+/).length} words, written to ${value('--out')}`);
  } else process.stdout.write(text);
} catch (error) {
  console.error(error instanceof SiteError ? error.message : error);
  process.exit(1);
}
