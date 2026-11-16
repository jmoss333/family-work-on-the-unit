#!/usr/bin/env node
// What is waiting for faculty review, highest risk first.   npm run queue
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteError, loadSite, reviewQueue } from '../src/lib/model.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const site = loadSite(root);
  const queue = reviewQueue(site.pages);
  if (!queue.length) console.log('Nothing is waiting. Every page is attested for this site.');
  for (const page of queue) {
    const risk = `${page.ledger.risk.kind}/${page.ledger.risk.level}`;
    console.log(`${risk.padEnd(18)} ${page.state.padEnd(18)} ${page.slug}`);
    console.log(`${' '.repeat(38)}${page.state === 'stale' ? 'Text changed after the review; needs re-attestation.' : page.ledger.reason}`);
  }
  console.log(`\n${queue.length} of ${site.pages.length} pages waiting. To attest one: npm run attest -- <slug>`);
} catch (error) {
  console.error(error instanceof SiteError ? error.message : error);
  process.exit(1);
}
