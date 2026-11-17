#!/usr/bin/env node
// Compare the unit workflow with the procedure it was copied from, sentence by sentence.
//
//   node tools/compare_workflow_source.mjs <procedure.txt> [substitutions.json] [--record]
//
// <procedure.txt> is the procedure saved as text. It names the unit, its institution and
// the products it uses, so it is kept OUTSIDE this repository, and so is the substitutions
// file: {"replace": [["a product's name", "a generic phrase"], ...]}, the wording changes
// that docs/WORKFLOW_INTAKE.md lists as Replaced or Expanded.
//
// It prints what it finds to the terminal, including what the procedure says that the
// workflow does not carry. That part may contain protected names: do not paste it into a
// file here. With --record it writes governance/workflow-source-check.json, which holds
// fingerprints and no text from the procedure; a test then holds the workflow to it.
// It exits 1 when a sentence is not in the procedure and the record gives no reason.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findProtected } from '../src/lib/protect.mjs';
import { checkRecord, compare, fingerprint } from '../src/lib/sourcecheck.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = 'workflows/unit-family-meeting.workflow.json';
const RECORD = 'governance/workflow-source-check.json';
const args = process.argv.slice(2);
const write = args.includes('--record');
const [sourcePath, substitutionsPath] = args.filter((arg) => !arg.startsWith('--'));
if (!sourcePath) {
  console.error('usage: node tools/compare_workflow_source.mjs <procedure.txt> [substitutions.json] [--record]');
  process.exit(2);
}
for (const path of [sourcePath, substitutionsPath].filter(Boolean)) {
  if (resolve(path).startsWith(`${resolve(root)}/`)) {
    console.error(`${path} is inside this repository. The procedure and its substitutions name the unit; keep them somewhere else.`);
    process.exit(2);
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const workflow = JSON.parse(readFileSync(join(root, WORKFLOW), 'utf8'));
const substitutions = substitutionsPath ? JSON.parse(readFileSync(substitutionsPath, 'utf8')).replace : [];
const result = compare(workflow, readFileSync(sourcePath, 'utf8'), substitutions);
const record = existsSync(join(root, RECORD)) ? JSON.parse(readFileSync(join(root, RECORD), 'utf8')) : { schema: 1, workflow: WORKFLOW, source: '', compared: today(), verbatim: {}, differs: {}, notCarried: '' };

const verbatim = result.rows.filter((row) => row.how === 'verbatim');
const others = result.rows.filter((row) => row.how !== 'verbatim');
console.log(`${result.rows.length} sentences a reader sees. ${verbatim.length} are in the procedure word for word and in its order${substitutions.length ? `, after ${substitutions.length} recorded substitutions` : ''}.`);
for (const from of result.unused) console.log(`  A substitution found nothing to replace (${from.length} characters long). Is it still needed?`);

let unexplained = 0;
if (others.length) console.log(`\n${others.length} are not:`);
for (const row of others) {
  const reason = record.differs?.[row.at];
  if (!reason) unexplained += 1;
  console.log(`\n  ${row.at}${reason ? '' : '   ← NO REASON RECORDED'}`);
  console.log(`    workflow:  ${row.text}`);
  console.log(row.how === 'capitals' ? '    procedure: the same words here, with different capitals' : row.how === 'elsewhere' ? '    procedure: has these words, and not at this place' : `    procedure: nearest is “${row.nearest}”`);
  if (reason) console.log(`    recorded:  ${reason}`);
}
const explainedAway = Object.keys(record.differs || {}).filter((at) => verbatim.some((row) => row.at === at));
for (const at of explainedAway) console.log(`\n  ${at} is recorded as differing, and it is in the procedure word for word. Remove it from "differs".`);

console.log(`\nWhat the procedure says that the workflow does not carry (${result.residue.length} pieces; may contain protected names):`);
for (const piece of result.residue) console.log(`  · ${piece}`);
const sameResidue = record.notCarried === result.residueHash;
if (record.notCarried) console.log(sameResidue ? '\nThat is what the record says was left out.' : '\nThat is NOT what was left out at the last comparison. Read the list above against docs/WORKFLOW_INTAKE.md, "What was changed".');

if (write) {
  if (unexplained || explainedAway.length) {
    console.error(`\nNot recorded: ${unexplained} sentence(s) differ with no reason, ${explainedAway.length} reason(s) are no longer needed. Edit "differs" in ${RECORD} and run again.`);
    process.exit(1);
  }
  const next = {
    schema: 1,
    workflow: WORKFLOW,
    source: record.source,
    compared: today(),
    substitutions: substitutions.length,
    notCarried: result.residueHash,
    differs: Object.fromEntries(others.map((row) => [row.at, record.differs[row.at]])),
    verbatim: Object.fromEntries(verbatim.map((row) => [row.at, fingerprint(row.text)])),
  };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const terms = JSON.parse(readFileSync(join(root, 'governance/protected-terms.json'), 'utf8'));
  if (findProtected(text, terms).length) {
    console.error('\nNot recorded: the record would contain a protected term. A reason under "differs" must not name what was replaced.');
    process.exit(1);
  }
  writeFileSync(join(root, RECORD), text);
  console.log(`\nRecorded in ${RECORD}.`);
} else {
  const problems = checkRecord(workflow, record);
  if (problems.length) console.log(`\nThe record in ${RECORD} does not fit the workflow:\n${problems.map((line) => `  - ${line}`).join('\n')}`);
  process.exit(unexplained || explainedAway.length || problems.length || (record.notCarried && !sameResidue) ? 1 : 0);
}
