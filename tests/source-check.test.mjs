// The unit workflow was copied from a procedure that cannot be in this repository: it names
// the unit. What has to hold here:
//   - every sentence a reader sees is either the sentence that was found in the procedure,
//     word for word and in its place, or is listed with the reason it differs;
//   - a sentence changed, added or dropped after the comparison is caught;
//   - the comparison itself finds a sentence only where the procedure has it.
// The comparison with the real procedure is run by hand (docs/ACCEPTANCE.md). These tests run
// the same code against a procedure made up here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRecord, compare, fingerprint, normalise, readerStrings } from '../src/lib/sourcecheck.mjs';
import { ROOT } from './helpers.mjs';

const WORKFLOW = 'workflows/unit-family-meeting.workflow.json';
const RECORD = 'governance/workflow-source-check.json';
const load = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const workflow = load(WORKFLOW);
const record = load(RECORD);
const TOOL = join(ROOT, 'tools/compare_workflow_source.mjs');

/** A procedure made up from the workflow's own sentences, laid out the way a one-page table
 *  comes out of a PDF: cells run together, lines break mid-phrase, and it has a title line
 *  and a list of sources that the workflow does not carry. */
function madeUp(w, { drop = [], change = {} } = {}) {
  const lines = ['QZX TEST UNIT family-meeting procedure · Owner: A. Sample · Page 1 of 1'];
  for (const { at, text } of readerStrings(w)) {
    if (drop.includes(at)) continue;
    const words = (change[at] ?? text).split(' ');
    const half = Math.ceil(words.length / 2);
    lines.push(words.length > 3 ? `${words.slice(0, half).join(' ')}\n\n${words.slice(half).join('  ')}` : words.join(' '));
  }
  lines.push('Sources: slides 1 to 3 of an internal deck.');
  return lines.join(' \n');
}
const how = (result) => Object.fromEntries(result.rows.map((row) => [row.at, row.how]));

test('A21 · every sentence of the workflow is the one found in the procedure, or is listed with the reason it differs', () => {
  assert.deepEqual(checkRecord(workflow, record), []);
  assert.equal(record.workflow, WORKFLOW);
  const strings = readerStrings(workflow);
  assert.equal(Object.keys(record.verbatim).length + Object.keys(record.differs).length, strings.length, 'the record and the workflow list different sentences');
  // Every sentence added to the procedure is on the list of those that differ, with the rest
  // of what was changed; none is passed off as the procedure's.
  for (const note of workflow.additions) assert.ok(`additions.${note.id}.text` in record.differs, `the added sentence “${note.id}” is not listed as differing`);
  assert.ok('basis' in record.differs);
  for (const [at, reason] of Object.entries(record.differs)) assert.ok(reason.length >= 30 && /\.$/.test(reason), `${at}: its reason is a sentence`);
  for (const [at, print] of Object.entries(record.verbatim)) assert.match(print, /^[0-9a-f]{12}$/, at);
  // Most of the workflow is the procedure word for word. If that stops being so, this says so.
  assert.ok(Object.keys(record.verbatim).length >= strings.length * 0.8, 'fewer than four sentences in five are the procedure’s own');
  // The record holds fingerprints and reasons, and none of the procedure's text beyond short quoted forms.
  assert.ok(readFileSync(join(ROOT, RECORD), 'utf8').length < 8000);
});

test('A21 · a sentence changed, added or dropped after the comparison is caught', () => {
  const changed = (edit, rec = record) => {
    const copy = load(WORKFLOW);
    const next = JSON.parse(JSON.stringify(rec));
    edit(copy, next);
    return checkRecord(copy, next).join(' | ');
  };
  assert.match(changed((w) => { w.guardrails[1] = w.guardrails[1].replace('72 hours', '48 hours'); }), /guardrails\.1: “No major decisions in the first 48 hours.*has changed since it was compared with the procedure on \d{4}-\d{2}-\d{2}\. Run the comparison again, or list it under "differs" with the reason\./);
  assert.match(changed((w) => { w.guardrails.push('One more guardrail.'); }), /guardrails\.5: “One more guardrail\.” has not been compared with the procedure/);
  assert.match(changed((w) => { w.exceptions.pop(); }), /exceptions\.4\.when: in the record, and the workflow has no such sentence/);
  assert.match(changed((w) => { w.steps[0].title = 'Ask on day one'; }), /steps\.ask\.title: “Ask on day one” has changed/);
  // White space is not a change; a letter is.
  assert.equal(changed((w) => { w.purpose = `  ${w.purpose.replace(' — ', '  —\n')} `; }), '');
  // Declaring the change, with its reason, is the other way through.
  assert.equal(changed((w, r) => { w.steps[0].title = 'Ask on day one'; delete r.verbatim['steps.ask.title']; r.differs['steps.ask.title'] = 'Changed on the author’s instruction.'; }), '');
  assert.match(changed((w, r) => { delete r.verbatim['steps.ask.title']; r.differs['steps.ask.title'] = ' '; }), /steps\.ask\.title: it differs from the procedure, and no reason is given/);
  assert.match(changed((w, r) => { r.differs['steps.ask.title'] = 'A reason, and it is also listed as found.'; }), /steps\.ask\.title: listed both as found in the procedure and as differing from it/);
  assert.match(changed((w, r) => { r.notCarried = ''; }), /"notCarried" is the fingerprint/);
  assert.match(changed((w, r) => { r.compared = 'yesterday'; }), /"compared" is the date of the comparison/);
  assert.deepEqual(checkRecord(workflow, { schema: 2 }), ['unknown schema (expected 1)']);
  // The row labels of the boards and the link labels are this site's own, and are not compared.
  const ats = readerStrings(workflow).map((item) => item.at);
  assert.ok(!ats.some((at) => at.startsWith('roles.') || at.includes('.links')));
  assert.equal(fingerprint('a  b\n c'), fingerprint('a b c'));
});

test('A21 · the comparison finds a sentence only where the procedure has it, and says what the procedure has that the workflow does not', () => {
  // As copied: every sentence is found, in order, through the broken lines.
  let result = compare(workflow, madeUp(workflow));
  assert.deepEqual([...new Set(result.rows.map((row) => row.how))], ['verbatim']);
  assert.equal(result.rows.length, readerStrings(workflow).length);
  assert.deepEqual(result.residue, ['QZX TEST UNIT family-meeting procedure · Owner: A. Sample · Page 1 of 1', 'Sources: slides 1 to 3 of an internal deck.']);
  const asCopied = result.residueHash;

  // A sentence the procedure does not have.
  result = compare(workflow, madeUp(workflow, { drop: ['guardrails.2'] }));
  assert.equal(how(result)['guardrails.2'], 'absent');
  assert.equal(result.rows.filter((row) => row.how !== 'verbatim').length, 1);
  assert.equal(result.residueHash, asCopied, 'dropping a sentence from the procedure does not change what the procedure has left over');

  // A word changed: the sentence is absent, and the nearest text shows where it nearly is.
  result = compare(workflow, madeUp(workflow, { change: { 'steps.bring-up.action': workflow.steps[4].action.replace('the meeting lead', 'the psychiatrist') } }));
  const row = result.rows.find((item) => item.at === 'steps.bring-up.action');
  assert.equal(row.how, 'absent');
  assert.ok(row.nearest.includes('Meet the support person at the entrance') && row.nearest.length > 60);
  assert.ok(result.residue.some((piece) => piece.includes('let the psychiatrist know they have arrived')), 'what the procedure says instead is listed as not carried');
  assert.notEqual(result.residueHash, asCopied);

  // The same words with different capitals are told apart from the same words.
  result = compare(workflow, madeUp(workflow, { change: { 'measures.list.2.name': workflow.measures.list[2].name.toLowerCase() } }));
  assert.equal(how(result)['measures.list.2.name'], 'capitals');

  // A label that occurs at another step does not count for this one. Step 7's owner is
  // step 1's owner, word for word; a procedure that gives step 7 to someone else must say so.
  assert.equal(workflow.steps[6].ownerLabel, workflow.steps[0].ownerLabel);
  result = compare(workflow, madeUp(workflow, { change: { 'steps.note.ownerLabel': 'Psychiatrist' } }));
  assert.equal(how(result)['steps.note.ownerLabel'], 'elsewhere');
  assert.equal(how(result)['steps.ask.ownerLabel'], 'verbatim');

  // A recorded substitution is applied to the procedure before it is compared; one that finds nothing is reported.
  const named = madeUp(workflow, { change: { 'guardrails.2': workflow.guardrails[2].replace('an AI tool', 'Zyxscribe or Qwertypilot') } });
  assert.equal(how(compare(workflow, named))['guardrails.2'], 'absent');
  result = compare(workflow, named, [['Zyxscribe or Qwertypilot', 'an AI tool'], ['Nowhere Corp', 'a company']]);
  assert.equal(how(result)['guardrails.2'], 'verbatim');
  assert.deepEqual(result.unused, ['Nowhere Corp']);

  // Markdown escapes from a text export are not differences.
  assert.equal(normalise('Review date: \\_\\_\\_ · \\# Step'), 'Review date: ___ · # Step');
});

test('A21 · the tool will not read a procedure kept inside the repository, and exits 1 on a sentence with no reason', () => {
  let run = spawnSync(process.execPath, [TOOL, join(ROOT, 'README.md')], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /is inside this repository\. The procedure and its substitutions name the unit; keep them somewhere else\./);
  run = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^usage: /);

  // Against a made-up procedure that lacks one of the workflow's sentences: it names the
  // sentence, says no reason is recorded, and does not touch the record.
  const dir = mkdtempSync(join(tmpdir(), 'fwu-procedure-'));
  writeFileSync(join(dir, 'procedure.txt'), madeUp(workflow, { drop: ['guardrails.4'] }));
  const before = readFileSync(join(ROOT, RECORD), 'utf8');
  run = spawnSync(process.execPath, [TOOL, join(dir, 'procedure.txt')], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout.slice(0, 400));
  assert.match(run.stdout, /guardrails\.4 {3}← NO REASON RECORDED/);
  assert.match(run.stdout, /That is NOT what was left out at the last comparison/);
  assert.equal(readFileSync(join(ROOT, RECORD), 'utf8'), before, 'the tool wrote the record without being asked to');
});
