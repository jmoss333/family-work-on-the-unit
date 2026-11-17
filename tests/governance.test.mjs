// The review gate. These tests change a throwaway copy of the sources and check that the
// build reacts the way the governance page promises.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { blobSha, pageDigest, reviewedMeta, upstreamDigest } from '../src/lib/hash.mjs';
import { RELEASES, SiteError, loadSite, ships } from '../src/lib/model.mjs';
import { ROOT, built, htmlFiles, read, scratchRepo, visibleText, walk } from './helpers.mjs';

const json = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const save = (dir, rel, value) => writeFileSync(join(dir, rel), `${JSON.stringify(value, null, 2)}\n`);
const out = () => mkdtempSync(join(tmpdir(), 'fwu-out-'));
const problems = (dir) => {
  try {
    loadSite(dir);
    return '';
  } catch (error) {
    assert.ok(error instanceof SiteError, String(error));
    return error.problems.join(' | ');
  }
};
/** Sign a page in a scratch repo the way the attest command would. */
function sign(dir, slug) {
  const page = loadSite(dir).pages.find((p) => p.slug === slug);
  const ledger = json(dir, 'governance/ledger.json');
  ledger[slug] = { status: 'reviewed', risk: ledger[slug].risk, at: '2026-11-16', by: 'Test Reviewer, MD', contentHash: page.contentHash };
  save(dir, 'governance/ledger.json', ledger);
  return page;
}

test('A7 · every teaching page has exactly one ledger row, and no row is orphaned', () => {
  const manifest = json(ROOT, 'content/manifest.json');
  const ledger = json(ROOT, 'governance/ledger.json');
  assert.deepEqual(Object.keys(ledger).sort(), manifest.pages.map((page) => page.slug).sort());
});

test('A7 · a reviewed row in the committed ledger always carries a well-formed hash and a named reviewer', () => {
  for (const [slug, row] of Object.entries(json(ROOT, 'governance/ledger.json'))) {
    if (row.status !== 'reviewed') continue;
    assert.match(row.contentHash, /^[a-f0-9]{40}$/, `${slug}: reviewed without a hash`);
    assert.notEqual(row.by, 'Pending faculty review', `${slug}: reviewed by nobody`);
  }
});

test('A9 · the public build holds the pages that may ship and no others; with none, it is an empty shell: no teaching page, title or sentence gets out', () => {
  const { dir, report } = built('public');
  const state = loadSite(ROOT);
  const shippable = state.pages.filter((page) => ships(page, 'public', state.config));
  assert.equal(report.counts.shipped, shippable.length);
  if (shippable.length === 0) {
    // No rehearsal and no adaptation page, so neither of their scripts.
    assert.deepEqual(walk(dir).sort(), ['404.html', 'about/governance.html', 'assets/site.css', 'assets/site.js', 'assets/tokens.css', 'build-report.json', 'index.html', 'robots.txt']);
    assert.match(read(dir, 'index.html'), /Nothing is published yet/);
  }
  // A page that may not ship is not in the build, and the pages the build writes itself
  // (the home page, the ledger, the index of moves, the not-found page) do not name it.
  // A page that did ship may: its sentences were reviewed as they stand, and a link from one
  // to a page still in review is written as plain words marked "(in review)". The next test
  // holds the build to that.
  const generated = ['index.html', 'about/governance.html', 'guide.html', '404.html'].filter((file) => existsSync(join(dir, file)));
  const text = generated.map((file) => visibleText(read(dir, file))).join(' ');
  const held = state.pages.filter((page) => !shippable.includes(page));
  for (const page of held) {
    assert.ok(!text.includes(page.title), `a page the build writes itself names the unreviewed page “${page.title}”`);
    assert.ok(!existsSync(join(dir, `${page.slug}.html`)), `${page.slug}.html reached the public build`);
  }
  if (!shippable.length) {
    // With nothing shipped there is no reviewed sentence to carry a name, so no page at all may.
    const all = htmlFiles(dir).map((file) => visibleText(read(dir, file))).join(' ');
    for (const page of held) assert.ok(!all.includes(page.title), `the public build names the unreviewed page “${page.title}”`);
  }
});

test('A9 · an attested page that links to a page still in review names it as plain words marked "(in review)", and nothing else in the build names it', () => {
  // The day the first page is attested, the public build stops being an empty shell. This is
  // that day, in a copy: the orientation page alone is attested, and it links to nine pages.
  const dir = scratchRepo();
  const slug = 'start/how-to-use';
  sign(dir, slug);
  const target = out();
  const report = build({ root: dir, outDir: target, channel: 'public' });
  assert.deepEqual(report.pages.filter((p) => p.shipped).map((p) => p.slug), [slug]);
  const held = loadSite(dir).pages.filter((page) => page.slug !== slug);
  const page = read(target, `${slug}.html`);
  const marked = page.replace(/<span class="note-in-review">\(in review\)<\/span>/g, '⟦in review⟧').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  let mentions = 0;
  for (const other of held) {
    for (let at = marked.indexOf(other.title); at !== -1; at = marked.indexOf(other.title, at + 1)) {
      mentions += 1;
      assert.ok(marked.slice(at + other.title.length).trimStart().startsWith('⟦in review⟧'), `“${other.title}” is named on the attested page without the mark`);
    }
    assert.ok(!existsSync(join(target, `${other.slug}.html`)), `${other.slug}.html reached the public build`);
  }
  assert.ok(mentions >= 5, 'the orientation page no longer links to the pages this test relies on');
  for (const [, href] of page.matchAll(/<a\s[^>]*?href="([^"#][^"]*)"/g)) {
    if (!/^https:/.test(href)) assert.ok(existsSync(join(target, 'start', href.split('#')[0])), `the attested page links to ${href}, which is not in the build`);
  }
  const generated = ['index.html', 'about/governance.html', '404.html'].map((file) => visibleText(read(target, file))).join(' ');
  for (const other of held) assert.ok(!generated.includes(other.title), `a page the build writes itself names “${other.title}”`);
  assert.ok(!existsSync(join(target, 'guide.html')), 'the index of moves is written only when a move card ships');
});

test('A7 · an attested page ships publicly, and stops shipping the moment its text changes', () => {
  const dir = scratchRepo();
  const slug = 'start/how-to-use';
  const page = sign(dir, slug);

  let report = build({ root: dir, outDir: out(), channel: 'public' });
  assert.deepEqual(report.pages.filter((p) => p.shipped).map((p) => p.slug), [slug]);
  assert.equal(report.pages.find((p) => p.slug === slug).state, 'attested');

  appendFileSync(join(dir, page.sources[0]), '\nOne more sentence, added after the review.\n');
  const target = out();
  report = build({ root: dir, outDir: target, channel: 'public' });
  assert.equal(report.pages.find((p) => p.slug === slug).state, 'stale');
  assert.equal(report.counts.shipped, 0, 'a page whose text changed after review must leave the public build');
  assert.ok(!existsSync(join(target, `${slug}.html`)));

  const review = out();
  build({ root: dir, outDir: review, channel: 'review' });
  assert.match(read(review, `${slug}.html`), /Changed since review\.<\/strong> Content changed since faculty review on November 16, 2026; awaiting re-attestation\./);
});

test('A7 · changing a page’s title or summary also reopens its review', () => {
  const dir = scratchRepo();
  const slug = 'room/shift-one-exchange';
  sign(dir, slug);
  assert.equal(loadSite(dir).pages.find((p) => p.slug === slug).state, 'attested');
  const manifest = json(dir, 'content/manifest.json');
  manifest.pages.find((p) => p.slug === slug).title = 'Shift one exchange, quickly';
  save(dir, 'content/manifest.json', manifest);
  assert.equal(loadSite(dir).pages.find((p) => p.slug === slug).state, 'stale');
});

test('A7 · a rehearsal’s attestation covers its case file: editing one line of dialogue reopens it', () => {
  const dir = scratchRepo();
  const slug = 'studio/when-a-friend-answers-first';
  sign(dir, slug);
  assert.equal(loadSite(dir).pages.find((p) => p.slug === slug).state, 'attested');
  const file = json(dir, 'cases/rowan-sal.case.json');
  file.nodes.private.lines[0].text += ' Tell me more.';
  save(dir, 'cases/rowan-sal.case.json', file);
  assert.equal(loadSite(dir).pages.find((p) => p.slug === slug).state, 'stale');
});

test('A7 · the build refuses a ledger edited into a shape only a hand edit produces', () => {
  const tamper = (edit) => {
    const dir = scratchRepo();
    const ledger = json(dir, 'governance/ledger.json');
    edit(ledger);
    save(dir, 'governance/ledger.json', ledger);
    return problems(dir);
  };
  assert.match(tamper((l) => { l['start/how-to-use'].status = 'reviewed'; l['start/how-to-use'].by = 'Someone, MD'; }), /reviewed with no contentHash/);
  assert.match(tamper((l) => { l['start/how-to-use'].status = 'reviewed'; l['start/how-to-use'].contentHash = 'a'.repeat(40); }), /names its reviewer/);
  assert.match(tamper((l) => { l['start/how-to-use'].contentHash = 'a'.repeat(40); }), /pending row carries no hash/);
  assert.match(tamper((l) => { delete l['start/how-to-use']; }), /no ledger row/);
  assert.match(tamper((l) => { l['ghost/page'] = l['start/how-to-use']; }), /has no page/);
  assert.match(tamper((l) => { l['start/how-to-use'].risk = { kind: 'general', level: 'high' }; }), /cannot be "high"/);
  assert.match(tamper((l) => { delete l['start/how-to-use'].reason; }), /needs a reason/);
});

test('A7 · a reviewed row with the wrong hash is not an error and not an attestation: it is "changed since review"', () => {
  const dir = scratchRepo();
  const ledger = json(dir, 'governance/ledger.json');
  ledger['start/how-to-use'] = { status: 'reviewed', risk: ledger['start/how-to-use'].risk, at: '2026-11-16', by: 'Test Reviewer, MD', contentHash: 'b'.repeat(40) };
  save(dir, 'governance/ledger.json', ledger);
  assert.equal(loadSite(dir).pages.find((p) => p.slug === 'start/how-to-use').state, 'stale');
  assert.equal(build({ root: dir, outDir: out(), channel: 'public' }).counts.shipped, 0);
});

test('A7 · the attest command refuses to run without a person at a terminal, and writes nothing', () => {
  const before = readFileSync(join(ROOT, 'governance/ledger.json'));
  const run = spawnSync(process.execPath, [join(ROOT, 'tools/attest.mjs'), 'start/how-to-use'], { input: 'Agent, MD\nstart/how-to-use\n', encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /refused/);
  assert.ok(before.equals(readFileSync(join(ROOT, 'governance/ledger.json'))), 'the ledger changed');
});

test('A8 · imported files are byte-identical to their pins', () => {
  const lock = json(ROOT, 'governance/sources.lock.json');
  for (const upstream of Object.values(lock.upstreams)) {
    for (const [key, pin] of Object.entries(upstream.files)) {
      assert.equal(blobSha(readFileSync(join(ROOT, pin.localPath))), pin.blob, `${key} has been edited`);
    }
  }
});

test('A8 · the upstream attestation hash is re-derived from the bytes shipped here', () => {
  const lock = json(ROOT, 'governance/sources.lock.json');
  let attested = 0;
  for (const upstream of Object.values(lock.upstreams)) {
    for (const [key, pin] of Object.entries(upstream.files)) {
      if (!pin.attestation) continue;
      attested += 1;
      const blob = blobSha(readFileSync(join(ROOT, pin.localPath)));
      assert.equal(upstreamDigest({ path: pin.path, blob, topicMetaBlob: pin.attestation.topicMetaBlob }), pin.attestation.contentHash, `${key}: upstream digest does not re-derive`);
    }
  }
  assert.equal(attested, 2);
  const states = Object.fromEntries(loadSite(ROOT).pages.filter((p) => p.origin === 'upstream').map((p) => [p.slug, p.state]));
  assert.notEqual(states['formats/pocket-card'], 'upstream-attested', 'the pocket card was never attested upstream and must not borrow a status');
});

test('A8 · editing an imported file by one byte fails the build', () => {
  const dir = scratchRepo();
  const pin = json(dir, 'governance/sources.lock.json').upstreams['psychiatry-clerkship'].files['family_playbook.md'];
  appendFileSync(join(dir, pin.localPath), ' ');
  assert.match(problems(dir), /no longer matches its pinned bytes/);
});

test('A8 · upstream attestation is honoured publicly only when the owner turns that on, and only for text that was attested', () => {
  const dir = scratchRepo();
  let report = build({ root: dir, outDir: out(), channel: 'public' });
  assert.equal(report.counts.shipped, 0, 'off by default');
  const config = json(dir, 'site.config.json');
  config.acceptUpstreamAttestation = true;
  save(dir, 'site.config.json', config);
  const target = out();
  report = build({ root: dir, outDir: target, channel: 'public' });
  assert.deepEqual(report.pages.filter((p) => p.shipped).map((p) => p.slug).sort(), ['formats/family-meeting-playbook-90', 'formats/modalities']);
  assert.match(read(target, 'formats/modalities.html'), /Attested upstream\./);
  // The playbook links to the modalities page (shipped) and nothing links to a withheld page.
  assert.ok(!existsSync(join(target, 'formats/pocket-card.html')));
});

test('A7 · the hash recipe is reproducible by hand with git', (t) => {
  const git = spawnSync('git', ['--version']);
  if (git.status !== 0) return t.skip('git is not installed');
  const page = loadSite(ROOT).pages.find((p) => p.slug === 'before/prepare-a-meeting');
  const file = join(ROOT, page.sources[0]);
  const viaGit = spawnSync('git', ['hash-object', '--no-filters', file], { encoding: 'utf8' }).stdout.trim();
  assert.equal(viaGit, blobSha(readFileSync(file)));
  const { digest, manifest } = pageDigest([{ path: page.sources[0], bytes: readFileSync(file) }], reviewedMeta(page));
  assert.equal(spawnSync('git', ['hash-object', '--stdin'], { input: manifest, encoding: 'utf8' }).stdout.trim(), digest);
  assert.equal(digest, page.contentHash);
});

// ── The second gate: pages that describe how a real unit works ───────────────────────
test('A16 · a page about a real unit is not attested by a clinical review alone: it needs its release record', () => {
  const dir = scratchRepo();
  const slug = 'system/unit-workflow';
  sign(dir, slug); // a reviewed row with the right hash and no release record
  assert.match(problems(dir), /page system\/unit-workflow: reviewed without its release record \(unit-practice\)/);
  assert.throws(() => build({ root: dir, outDir: out(), channel: 'public' }), SiteError);

  const ledger = json(dir, 'governance/ledger.json');
  const full = { gate: 'unit-practice', by: 'Test Reviewer, MD', at: '2026-11-16', confirmed: Object.keys(RELEASES['unit-practice'].confirm) };
  ledger[slug].release = { ...full, confirmed: full.confirmed.slice(0, 2) };
  save(dir, 'governance/ledger.json', ledger);
  assert.match(problems(dir), /reviewed without its release record/, 'two of three confirmations must not be enough');

  ledger[slug].release = full;
  save(dir, 'governance/ledger.json', ledger);
  assert.equal(problems(dir), '');
  const target = out();
  const report = build({ root: dir, outDir: target, channel: 'public' });
  assert.deepEqual(report.pages.filter((p) => p.shipped).map((p) => p.slug), [slug]);
  assert.match(read(target, `${slug}.html`), /<strong>Attested\.<\/strong> Reviewed by Test Reviewer, MD on November 16, 2026\./);
});

test('A16 · a release record cannot sit on a pending row, or on a page that has no release gate', () => {
  const record = { gate: 'unit-practice', by: 'Test Reviewer, MD', at: '2026-11-16', confirmed: Object.keys(RELEASES['unit-practice'].confirm) };
  let dir = scratchRepo();
  let ledger = json(dir, 'governance/ledger.json');
  ledger['system/set-it-up'].release = record;
  save(dir, 'governance/ledger.json', ledger);
  assert.match(problems(dir), /a pending row carries no release record/);

  dir = scratchRepo();
  sign(dir, 'start/how-to-use');
  ledger = json(dir, 'governance/ledger.json');
  ledger['start/how-to-use'].release = record;
  save(dir, 'governance/ledger.json', ledger);
  assert.match(problems(dir), /carries a release record, but the page has no release gate/);
});

test('A16 · the release gate asks three things, and the governance page says so', () => {
  assert.deepEqual(Object.keys(RELEASES['unit-practice'].confirm), ['no-identifiers', 'no-internal-figures', 'permitted-to-publish']);
  const page = visibleText(read(built('review').dir, 'about/governance.html'));
  assert.ok(page.includes('A page that describes how a real unit works carries a second gate.'));
  const site = loadSite(ROOT);
  for (const p of site.pages.filter((p) => p.release)) assert.equal(p.ledger.risk.kind, 'local-policy', `${p.slug}: a unit-practice page is a local-policy risk`);
});
