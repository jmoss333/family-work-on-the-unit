// A reviewer outside the site reads it as one file, and reports findings that quote the
// words they are about. What has to hold:
//   - the packet says what the built pages say: every page, in order, nothing added;
//   - a finding whose quote is not on the page it names is caught before anyone acts on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSite } from '../src/lib/model.mjs';
import { checkFindings, packet, packetPages, pageText, plain } from '../src/lib/packet.mjs';
import { normalise, readerStrings } from '../src/lib/sourcecheck.mjs';
import { ROOT, built, read } from './helpers.mjs';

const site = loadSite(ROOT);
const make = (base = '') => {
  const { dir, report } = built('review');
  return { report, text: packet(report, (file) => read(dir, file), { site, base, date: '2026-11-17', commit: 'abc1234' }) };
};
const squash = (text) => text.replace(/\s+/g, ' ').trim();

test('A23 · a page’s text is its words, in reading order, without markup or decoration', () => {
  const html = '<html><body><header>Site</header><main id="main"><nav class="breadcrumb"><ol><li>Home</li></ol></nav>' +
    '<h1>A title</h1><p>First &amp; “second”.</p><ul><li>One</li><li>Two</li></ul>' +
    '<table><tr><th>Measure</th><th>Checks</th></tr><tr><td>A</td><td>B</td></tr></table>' +
    '<p class="who"><span class="badge">Social work</span><span>Within 24 h</span></p>' +
    '<span class="n" aria-hidden="true">7</span><span class="sr-only">Step 7: </span>Note' +
    '<label for="x">Who books?</label><select id="x"><option value="a" selected>Unit secretary</option><option value="none">No one yet</option></select>' +
    '<button type="button" disabled>Print your version</button>' +
    '<script type="application/json">{"payload": 1}</script><noscript><p>Needs a script.</p></noscript></main><footer>Foot</footer></body></html>';
  const text = pageText(html);
  assert.equal(text, ['##### A title', '', 'First & “second”.', '', '- One', '- Two', '', 'Measure | Checks |', 'A | B |', '', 'Social work · Within 24 h', 'Step 7: Note', 'Who books?', '', '· Unit secretary', '· No one yet', '[button: Print your version]'].join('\n').replace('##### ', '### '));
  for (const gone of ['Site', 'Foot', 'Home', 'payload', 'Needs a script', '<', '7Step']) assert.ok(!text.includes(gone), `“${gone}” should not be in the text`);
});

test('A23 · the packet holds every page of the review build, in order, and says nothing the pages do not', () => {
  const { report, text } = make('https://example.test/');
  const shipped = report.pages.filter((page) => page.shipped);
  const pages = packetPages(text);
  assert.equal(pages.length, shipped.length);
  shipped.forEach((page, index) => {
    const title = site.pages.find((other) => other.slug === page.slug).title;
    assert.ok(text.includes(`\n${index + 1}. ${title} (`), `not in the contents: ${title}`);
    assert.ok(pages[index].startsWith(`${title}\n\nAddress: https://example.test/${page.slug}\n`), `page ${index + 1} is not ${title}`);
    assert.match(pages[index], /\nSection: .+ · Kind: [a-z]+ · Review: (?:in review, not attested|attested upstream, for another audience|attested|changed since its review, not attested) · Risk: [a-z-]+, [a-z]+\n/);
    // What the page says is the page's own text: every line of it is in the built page.
    const body = pages[index].split('\n').slice(4).join('\n');
    assert.equal(body.trim(), pageText(read(built('review').dir, page.file)), `page ${index + 1}: its text is not the built page's`);
  });
  assert.match(text, /^# Family Work on the Unit: review packet\n\nThe words of every page in the review build, at commit abc1234, made on 2026-11-17\. 22 pages\.\n/);
  assert.ok(!/<[a-z/][^>]*>/i.test(text), 'markup reached the packet');
  assert.ok(!text.includes('"schema"') && !text.includes('{"workflow"'), 'a data block reached the packet');

  // The unit workflow is there whole: every sentence a reader of the page sees.
  const workflowPage = squash(pages[shipped.findIndex((page) => page.slug === 'system/unit-workflow')]);
  for (const { at, text: sentence } of readerStrings(site.pages.find((page) => page.slug === 'system/unit-workflow').workflowFile)) assert.ok(workflowPage.includes(normalise(sentence)), `the workflow page in the packet lacks ${at}`);
  // The adaptation page shows its menus with their options, its board and its buttons; the
  // role cards, which repeat the sheet once for each role, are left out.
  const adaptPage = pages[shipped.findIndex((page) => page.slug === 'system/adapt-it')];
  assert.ok(adaptPage.includes('Is the note drafted by an ambient documentation tool?\n\n· Yes\n· No\n'));
  assert.ok(adaptPage.includes('[button: Social work]') && adaptPage.includes('Handoffs in this version: 5, after steps 1, 2, 3, 4 and 5.'));
  assert.equal(adaptPage.split('Make the collateral call.').length - 1, 1, 'the role cards are repeated in the packet');
  // Every position of the rehearsal can be read.
  const studio = pages[shipped.findIndex((page) => page.slug === 'studio/when-a-friend-answers-first')];
  const positions = JSON.parse(readFileSync(join(ROOT, site.pages.find((page) => page.slug === 'studio/when-a-friend-answers-first').sources.find((file) => file.endsWith('.json'))), 'utf8'));
  const nodes = Array.isArray(positions.positions) ? positions.positions : Object.values(positions.positions || positions.nodes || {});
  assert.ok(nodes.length >= 25, 'the case file was not read');
  for (const node of nodes) if (typeof node.title === 'string') assert.ok(squash(studio).includes(squash(node.title)), `the rehearsal in the packet lacks “${node.title}”`);
  // A page attested for another audience says so.
  assert.equal((text.match(/Review: attested upstream, for another audience/g) || []).length, shipped.filter((page) => page.state === 'upstream-attested').length);
});

test('A23 · a finding is checked against the page it names: its words must be there', () => {
  const { text } = make();
  const pages = packetPages(text);
  const workflowIndex = pages.findIndex((page) => page.startsWith('The unit workflow\n')) + 1;
  const good = { id: 'F1', reader: 'staff', page: workflowIndex, quote: 'Make the collateral call. In the same call, invite the support person', kind: 'unclear', severity: 'medium', what: 'The step does not say what to do when the number on file is wrong.', confidence: 'medium' };
  const check = (findings, extra = {}) => checkFindings({ reviewer: 'A model, version 1', lens: 'five cold readers', findings, ...extra }, pages);
  assert.deepEqual(check([good]), { rows: [{ id: 'F1', page: workflowIndex, ok: true, problems: [] }], errors: [] });

  // Typography is forgiven: straight quotes for curly ones, a hyphen for a dash, any spacing, any capitals.
  assert.ok(check([{ ...good, quote: "  “FAMILY” means the people the\npatient chooses " }]).rows[0].ok);
  assert.ok(check([{ ...good, quote: '"Family" means the people the patient chooses' }]).rows[0].ok);
  assert.equal(plain('“a” — ‘b’ … c'), '"a" - \'b\' ... c');
  // A word is not.
  assert.deepEqual(check([{ ...good, quote: 'Make the collateral call. In the same call, invite the family' }]).rows[0].problems, [`quote: those words are not on page ${workflowIndex}`]);
  // The words exist, on another page.
  assert.deepEqual(check([{ ...good, page: 1 }]).rows[0].problems, ['quote: those words are not on page 1']);
  // A contradiction quotes both sides.
  assert.ok(check([{ ...good, kind: 'contradiction', page2: workflowIndex, quote2: 'One call, not two.' }]).rows[0].ok);
  assert.deepEqual(check([{ ...good, kind: 'contradiction', page2: workflowIndex, quote2: 'Two calls, not one.' }]).rows[0].problems, [`second quote: those words are not on page ${workflowIndex}`]);
  // Incomplete or malformed findings.
  assert.deepEqual(check([{ ...good, quote: 'collateral call' }]).rows[0].problems, ['quote: quote at least four words from the page']);
  assert.deepEqual(check([{ ...good, page: 99 }]).rows[0].problems, ['quote: there is no page 99']);
  assert.deepEqual(check([{ ...good, page: '17' }]).rows[0].problems, ['quote: there is no page 17']);
  assert.deepEqual(check([{ ...good, kind: 'bad', severity: 'urgent', confidence: undefined, what: 'Wrong.' }]).rows[0].problems, [
    '"kind" is one of: unsafe, unclear, missing, contradiction, identifiable, tone, works-well', '"severity" is one of: high, medium, low', '"confidence" is one of: high, medium, low', '"what" says what is wrong, in a sentence',
  ]);
  assert.deepEqual(check([good, good]).rows[1].problems, ['its id is used twice']);
  assert.equal(check([{ ...good, id: undefined }]).rows[0].id, '#1');
  assert.deepEqual(checkFindings({ findings: [good] }, pages).errors, ['"reviewer" is required', '"lens" is required']);
  assert.deepEqual(checkFindings('[]', pages).errors, ['not a findings file: it needs a "findings" list']);
});

test('A23 · the two commands: a packet to hand out, and a check that exits 1 on a finding the site does not bear out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fwu-review-'));
  const out = join(dir, 'packet.md');
  let run = spawnSync(process.execPath, [join(ROOT, 'tools/review_packet.mjs'), '--base', 'https://example.test', '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^22 pages, \d+ words, written to /);
  const text = readFileSync(out, 'utf8');
  assert.equal(packetPages(text).length, 22);
  const page = packetPages(text).findIndex((item) => item.startsWith('The unit workflow\n')) + 1;
  const finding = (id, quote) => ({ id, reader: 'resident', page, quote, kind: 'unclear', severity: 'low', what: 'A sentence saying what is wrong and for whom.', confidence: 'low' });
  const save = (findings) => { writeFileSync(join(dir, 'findings.json'), JSON.stringify({ reviewer: 'A model', lens: 'five cold readers', findings })); return join(dir, 'findings.json'); };

  run = spawnSync(process.execPath, [join(ROOT, 'tools/check_findings.mjs'), save([finding('F1', 'Listening is not disclosing. An involuntary status')]), out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /1 findings: 1 point at words that are on the page they name, 0 do not or are incomplete\./);
  // Checked against the site as it stands, when no packet is given.
  run = spawnSync(process.execPath, [join(ROOT, 'tools/check_findings.mjs'), save([finding('F1', 'Listening is not disclosing. An involuntary status'), finding('F2', 'The team may disclose whatever the family asks for')])], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, new RegExp(`F2 \\(page ${page}\\): quote: those words are not on page ${page}`));
  assert.match(run.stdout, /2 findings: 1 point at words that are on the page they name, 1 do not or are incomplete\./);
  writeFileSync(join(dir, 'broken.json'), '{ not json');
  run = spawnSync(process.execPath, [join(ROOT, 'tools/check_findings.mjs'), join(dir, 'broken.json'), out], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /is not JSON/);
  assert.equal(spawnSync(process.execPath, [join(ROOT, 'tools/check_findings.mjs')], { encoding: 'utf8' }).status, 2);
});
