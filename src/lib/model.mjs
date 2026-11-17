// Load the site's sources, refuse anything inconsistent, and work out each page's review
// state. Nothing here writes a file.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEX40, PENDING_SENTINEL, blobSha, pageDigest, reviewedMeta, upstreamDigest } from './hash.mjs';
import { validateCase } from './casegraph.mjs';
import { validateWorkflow } from './workflow.mjs';
import { ADAPT_SCRIPT, validateAdaptation } from './adapt.mjs';

export const KINDS = new Set(['page', 'card', 'studio', 'register', 'workflow', 'adapt']);
// A page that describes how a real unit works needs more than a clinical read before it is
// public. The attest command asks the reviewer to confirm each line below, and a reviewed
// row without that record is refused.
export const RELEASES = {
  'unit-practice': {
    about: 'This page describes how a real unit works.',
    confirm: {
      'no-identifiers': 'It names no patient, staff member, unit, hospital or product.',
      'no-internal-figures': 'It reports no internal figure: no census, count, rate or audit result.',
      'permitted-to-publish': 'I am permitted to publish it under my institution’s rules.',
    },
    word: 'released',
  },
};
export const RISK_KINDS = new Set(['general', 'clinical', 'legal', 'formulary', 'local-policy']);
export const RISK_LEVELS = ['low', 'moderate', 'high'];
export const STALE_REASON = 'Content changed since faculty review on {at}; awaiting re-attestation.';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SiteError extends Error {
  constructor(problems) {
    super(`The site sources are inconsistent:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/**
 * @param {string} root  repository root
 * @returns the site model: config, sections, pages (with state), register, cases, upstream pins
 */
export function loadSite(root) {
  const problems = [];
  const config = readJson(root, 'site.config.json');
  const manifest = readJson(root, 'content/manifest.json');
  const ledger = readJson(root, 'governance/ledger.json');
  const lock = readJson(root, 'governance/sources.lock.json');
  const register = readJson(root, 'evidence/register.json');
  const protectedTerms = readJson(root, 'governance/protected-terms.json');
  if (!Array.isArray(protectedTerms.hashes) || !protectedTerms.hashes.length || !protectedTerms.hashes.every((h) => /^[a-f0-9]{64}$/.test(h))) problems.push('governance/protected-terms.json: the list of hashes is empty or malformed');

  const sectionIds = new Set(config.sections.map((s) => s.id));
  const evidenceIds = new Set(register.records.map((r) => r.id));
  if (evidenceIds.size !== register.records.length) problems.push('evidence/register.json: duplicate record ids');
  for (const record of register.records) {
    if (!register.classes[record.class]) problems.push(`evidence ${record.id}: unknown class "${record.class}"`);
    const c = record.citation;
    if (!c?.pmid && !c?.doi && !(record.links || []).length) problems.push(`evidence ${record.id}: no PMID, DOI or link`);
    if (!record.summary) problems.push(`evidence ${record.id}: no summary`);
    if (!DATE.test(record.check?.on || '')) problems.push(`evidence ${record.id}: no dated source check`);
  }

  // ── Upstream pins: the bytes we ship are the bytes that were pinned, and the pinned bytes
  //    are the ones the upstream ledger attested.
  const upstreamFiles = new Map(); // upstreamKey -> pin (with .verified, .upstreamName)
  for (const [upstreamName, upstream] of Object.entries(lock.upstreams || {})) {
    if (!config.upstream?.[upstreamName]) problems.push(`sources.lock.json: upstream "${upstreamName}" is not declared in site.config.json`);
    for (const [key, pin] of Object.entries(upstream.files || {})) {
      const abs = join(root, pin.localPath);
      if (!existsSync(abs)) {
        problems.push(`upstream ${key}: ${pin.localPath} is missing`);
        continue;
      }
      const actual = blobSha(readFileSync(abs));
      if (actual !== pin.blob) problems.push(`upstream ${key}: ${pin.localPath} no longer matches its pinned bytes (${actual} != ${pin.blob}). Imported files are never edited here.`);
      let verified = false;
      if (pin.attestation) {
        const derived = upstreamDigest({ path: pin.path, blob: pin.blob, topicMetaBlob: pin.attestation.topicMetaBlob });
        verified = actual === pin.blob && derived === pin.attestation.contentHash;
        if (derived !== pin.attestation.contentHash) problems.push(`upstream ${key}: the recorded upstream attestation hash cannot be re-derived from the pinned bytes`);
      }
      upstreamFiles.set(key, { ...pin, key, upstreamName, verified });
    }
  }

  // ── Pages
  const seen = new Set();
  const cases = new Map();
  const pages = manifest.pages.map((entry) => {
    const page = { ...entry };
    const at = `page ${page.slug}`;
    if (!SLUG.test(page.slug || '')) problems.push(`${at}: slug must look like section/page-name`);
    if (seen.has(page.slug)) problems.push(`${at}: duplicate slug`);
    seen.add(page.slug);
    if (!sectionIds.has(page.section)) problems.push(`${at}: unknown section "${page.section}"`);
    if (!KINDS.has(page.kind)) problems.push(`${at}: unknown kind "${page.kind}"`);
    if (!page.title || !page.summary) problems.push(`${at}: title and summary are required`);
    if (!manifest.origins[page.origin]) problems.push(`${at}: unknown origin "${page.origin}"`);
    if (page.release !== undefined && !RELEASES[page.release]) problems.push(`${at}: unknown release gate "${page.release}"`);
    for (const id of page.evidence || []) if (!evidenceIds.has(id)) problems.push(`${at}: cites unknown evidence "${id}"`);
    if (!Array.isArray(page.sources) || !page.sources.length) problems.push(`${at}: no sources`);

    const sources = [];
    for (const rel of page.sources || []) {
      const abs = join(root, rel);
      if (!existsSync(abs)) problems.push(`${at}: source ${rel} is missing`);
      else sources.push({ path: rel, bytes: readFileSync(abs) });
    }
    if (sources.length) {
      const { digest, manifest: manifestText } = pageDigest(sources, reviewedMeta(page));
      page.contentHash = digest;
      page.hashManifest = manifestText;
    }
    page.sourceText = sources.length ? sources[0].bytes.toString('utf8') : '';

    if (page.origin === 'upstream') {
      const pin = upstreamFiles.get(page.upstreamKey);
      if (!pin) problems.push(`${at}: upstreamKey "${page.upstreamKey}" has no pin in sources.lock.json`);
      else if (pin.localPath !== page.sources[0]) problems.push(`${at}: its source is not the pinned file`);
      page.upstream = pin || null;
    }
    if (page.kind === 'studio') {
      if (!page.case || page.case !== page.sources[0]) problems.push(`${at}: a studio page's source is its case file`);
      else if (existsSync(join(root, page.case))) {
        const caseFile = readJson(root, page.case);
        for (const error of validateCase(caseFile)) problems.push(`${page.case}: ${error}`);
        cases.set(page.slug, caseFile);
        page.caseFile = caseFile;
      }
    }
    if (page.kind === 'workflow') {
      if (!page.workflow || page.workflow !== page.sources[0]) problems.push(`${at}: a workflow page's source is its workflow file`);
      else if (existsSync(join(root, page.workflow))) {
        const workflowFile = readJson(root, page.workflow);
        for (const error of validateWorkflow(workflowFile)) problems.push(`${page.workflow}: ${error}`);
        page.workflowFile = workflowFile;
      }
    }
    if (page.kind === 'adapt') {
      // What a reader sees on this page is computed: the script applies the rules to the
      // workflow. So the review covers all three files, and a change to any of them makes the
      // page "changed since review". (A rehearsal's script only moves between positions whose
      // text is all in the case file, so that review covers the case file alone.)
      const expected = [page.adapt, page.workflow, ADAPT_SCRIPT];
      const complete = page.adapt && page.workflow && page.sources.length === 3 && expected.every((file) => page.sources.includes(file));
      if (!complete) problems.push(`${at}: an adaptation page's sources are its rules, the workflow they rewrite, and ${ADAPT_SCRIPT}`);
      else if (existsSync(join(root, page.adapt)) && existsSync(join(root, page.workflow))) {
        const workflowFile = readJson(root, page.workflow);
        const adaptFile = readJson(root, page.adapt);
        // A broken workflow is reported once, by its own page.
        if (!validateWorkflow(workflowFile).length) for (const error of validateAdaptation(adaptFile, workflowFile)) problems.push(`${page.adapt}: ${error}`);
        page.workflowFile = workflowFile;
        page.adaptFile = adaptFile;
      }
    }

    // ── Ledger row and effective state
    const row = ledger[page.slug];
    if (!row) problems.push(`${at}: no ledger row. Every teaching page starts as pending.`);
    else {
      if (!RISK_KINDS.has(row.risk?.kind) || !RISK_LEVELS.includes(row.risk?.level)) problems.push(`${at}: ledger risk is malformed`);
      if (row.risk?.kind === 'general' && row.risk?.level === 'high') problems.push(`${at}: "general" risk cannot be "high"; name the kind`);
      if (!DATE.test(row.at || '')) problems.push(`${at}: ledger date must be YYYY-MM-DD`);
      if (row.status === 'pending') {
        if (row.by !== PENDING_SENTINEL) problems.push(`${at}: a pending row is signed "${PENDING_SENTINEL}"`);
        if (!row.reason || row.reason.length > 240) problems.push(`${at}: a pending row needs a reason of 240 characters or fewer`);
        if (row.contentHash) problems.push(`${at}: a pending row carries no hash`);
        if (row.release) problems.push(`${at}: a pending row carries no release record`);
      } else if (row.status === 'reviewed') {
        if (!row.by || row.by === PENDING_SENTINEL) problems.push(`${at}: a reviewed row names its reviewer`);
        if (!HEX40.test(row.contentHash || '')) problems.push(`${at}: reviewed with no contentHash. Bind it with the attest command, never by hand.`);
        const gate = RELEASES[page.release];
        if (gate) {
          const release = row.release || {};
          const complete = Object.keys(gate.confirm).every((key) => (release.confirmed || []).includes(key));
          if (!complete || !release.by || !DATE.test(release.at || '')) problems.push(`${at}: reviewed without its release record (${page.release}). The attest command writes it; never add it by hand.`);
        } else if (row.release) {
          problems.push(`${at}: carries a release record, but the page has no release gate`);
        }
      } else {
        problems.push(`${at}: ledger status must be "pending" or "reviewed"`);
      }
    }
    page.ledger = row || null;
    page.state = stateOf(page);
    return page;
  });

  for (const slug of Object.keys(ledger)) if (!seen.has(slug)) problems.push(`ledger row "${slug}" has no page`);
  for (const page of pages) {
    if (page.practice && !seen.has(page.practice)) problems.push(`page ${page.slug}: practice target "${page.practice}" does not exist`);
  }
  const cards = pages.filter((p) => p.kind === 'card').sort((a, b) => a.order - b.order);
  cards.forEach((card, i) => {
    if (card.order !== i + 1) problems.push(`cards must be numbered 1..${cards.length} without gaps (found ${card.order})`);
  });

  if (problems.length) throw new SiteError(problems);
  return { root, config, manifest, ledger, lock, register, protectedTerms, pages, cards, cases, upstreamFiles };
}

/** attested | stale | upstream-attested | pending */
export function stateOf(page) {
  const row = page.ledger;
  if (row?.status === 'reviewed') return row.contentHash === page.contentHash ? 'attested' : 'stale';
  if (page.upstream?.attestation && page.upstream.verified) return 'upstream-attested';
  return 'pending';
}

/** Does this page ship in this channel? The public channel carries attested text only. */
export function ships(page, channel, config) {
  if (channel === 'review') return true;
  if (page.state === 'attested') return true;
  return page.state === 'upstream-attested' && config.acceptUpstreamAttestation === true;
}

export function reviewQueue(pages) {
  const weight = (page) => RISK_LEVELS.indexOf(page.ledger.risk.level);
  return pages.filter((p) => p.state !== 'attested').sort((a, b) => weight(b) - weight(a) || a.slug.localeCompare(b.slug));
}
