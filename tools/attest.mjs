#!/usr/bin/env node
// Record a faculty attestation.        npm run attest -- room/shift-one-exchange
//
// THIS COMMAND IS FOR A PERSON. It binds a reviewer's name and today's date to the exact
// text of one page (see src/lib/hash.mjs for what the hash covers). It refuses to run
// unless someone is at a terminal: no script, CI job or AI assistant can use it to sign a
// page. That is the point. An assistant that edits governance/ledger.json by hand to mark a
// page reviewed is doing the one thing this repository exists to prevent.
//
// To withdraw an attestation, set the row back to "pending" by hand with a reason; the
// build accepts that, and the page leaves the public site at the next deploy.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { RELEASES, SiteError, loadSite } from '../src/lib/model.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];

if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) {
  console.error('attest: refused. Attestation is recorded by a faculty reviewer at a terminal, never by a script, a CI job or an AI assistant.');
  process.exit(1);
}
if (!slug) {
  console.error('usage: npm run attest -- <slug>     (npm run queue lists what is waiting)');
  process.exit(2);
}

let site;
try {
  site = loadSite(root);
} catch (error) {
  console.error(error instanceof SiteError ? error.message : error);
  process.exit(1);
}
const page = site.pages.find((candidate) => candidate.slug === slug);
if (!page) {
  console.error(`attest: no page "${slug}".`);
  process.exit(2);
}

const rule = '─'.repeat(72);
console.log(`\n${rule}\n${page.title}\n${rule}`);
console.log(`Slug:    ${page.slug}`);
console.log(`Risk:    ${page.ledger.risk.kind}, ${page.ledger.risk.level}`);
console.log(`State:   ${page.state}`);
console.log(`Origin:  ${site.manifest.origins[page.origin]}`);
console.log(`\nThe attestation will cover exactly these inputs:\n\n${page.hashManifest}`);
console.log(`Hash:    ${page.contentHash}`);
console.log(`\nRead the page as it will ship: dist/${page.slug}.html (npm run build)\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const by = (await rl.question('Your name and degree, as it should appear in the ledger: ')).trim();
const confirm = (await rl.question(`Type the slug again to attest that you have reviewed this text: `)).trim();
if (!by || by === 'Pending faculty review' || confirm !== slug) {
  rl.close();
  console.error('attest: nothing recorded.');
  process.exit(1);
}

// A second, separate confirmation for a page that describes how a real unit works. It is a
// different question from "is this clinically right", so it is asked and recorded apart.
const gate = RELEASES[page.release];
let release;
if (gate) {
  console.log(`\n${rule}\n${gate.about} Before it can be published, confirm each line:\n`);
  Object.values(gate.confirm).forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  const word = (await rl.question(`\nType "${gate.word}" to confirm all ${Object.keys(gate.confirm).length}, or anything else to stop: `)).trim();
  if (word !== gate.word) {
    rl.close();
    console.error('attest: nothing recorded. The page stays in review.');
    process.exit(1);
  }
}
rl.close();

const now = new Date();
const at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const ledgerPath = join(root, 'governance', 'ledger.json');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
if (gate) release = { gate: page.release, by, at, confirmed: Object.keys(gate.confirm) };
ledger[slug] = { status: 'reviewed', risk: ledger[slug].risk, at, by, contentHash: page.contentHash, ...(release ? { release } : {}) };
writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`\nRecorded: ${slug} reviewed by ${by} on ${at}. Commit governance/ledger.json to publish it.`);
