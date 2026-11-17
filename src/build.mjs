#!/usr/bin/env node
// Build the static site.
//
//   node src/build.mjs                    review build into dist/ (everything, each page marked)
//   node src/build.mjs --channel public   public build (attested pages only)
//   SITE_CHANNEL=public node src/build.mjs
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: the public channel ships a page only if a faculty
// attestation is bound to its exact text. Unreviewed text cannot reach the production URL by
// construction, whatever else goes wrong, because the filter is here and not in a checklist.
//
// The build is deterministic: the same sources give byte-identical output. It stamps no
// clock time; the only run-specific value is the commit id Netlify passes in.
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteError, loadSite, reviewQueue, ships } from './lib/model.mjs';
import { describeHits, findProtected } from './lib/protect.mjs';
import { relHref, renderMarkdown } from './lib/render.mjs';
import * as T from './lib/templates.mjs';

const GENERATED = { home: 'index.html', guide: 'guide.html', 'guide-print': 'guide-print.html', 'about/governance': 'about/governance.html' };

/**
 * @param {{root: string, outDir: string, channel?: 'review'|'public', buildId?: string}} options
 * @returns the build report (also written to <outDir>/build-report.json)
 */
export function build({ root, outDir, channel = 'review', buildId = '' }) {
  if (channel !== 'review' && channel !== 'public') throw new Error(`unknown channel "${channel}" (use "review" or "public")`);
  const site = loadSite(root);
  const { config } = site;

  site.sectionById = new Map(config.sections.map((section) => [section.id, section]));
  site.evidenceById = new Map(site.register.records.map((record) => [record.id, record]));
  site.bySlug = new Map();
  for (const page of site.pages) {
    if (GENERATED[page.slug]) throw new SiteError([`page ${page.slug}: that address belongs to a generated page`]);
    page.file = `${page.slug}.html`;
    site.bySlug.set(page.slug, page);
  }

  const shipped = site.pages.filter((page) => ships(page, channel, config));
  const outputs = new Set(['index.html', 'about/governance.html', '404.html', ...shipped.map((page) => page.file)]);
  const shippedCards = site.cards.filter((card) => outputs.has(card.file));
  if (shippedCards.length) {
    outputs.add('guide.html');
    outputs.add('guide-print.html');
  }

  const register = site.pages.find((page) => page.kind === 'register');
  const studio = site.pages.find((page) => page.kind === 'studio');
  const workflow = site.pages.find((page) => page.kind === 'workflow');
  const map = site.pages.find((page) => page.kind === 'map');
  const nav = [
    { file: 'index.html', label: 'Home' },
    ...(map ? [{ file: map.file, label: 'Map' }] : []),
    { file: 'guide.html', label: 'Six moves' },
    ...(studio ? [{ file: studio.file, label: 'Practice studio' }] : []),
    ...(workflow ? [{ file: workflow.file, label: 'Unit workflow' }] : []),
    ...(register ? [{ file: register.file, label: 'Evidence' }] : []),
    { file: 'about/governance.html', label: 'Governance' },
  ];

  const context = (file, page = null, { absolute = false } = {}) => {
    const ctx = {
      site,
      channel,
      outputs,
      nav,
      file,
      page,
      buildId,
      href: absolute ? (to) => `/${to}` : (to) => relHref(file, to),
      evidenceLink(id) {
        const record = site.evidenceById.get(id);
        if (!record) throw new SiteError([`${file}: cites [${id}], which is not in the evidence register`]);
        const href = register && outputs.has(register.file) ? `${ctx.href(register.file)}#${id}` : null;
        return { href, label: record.short };
      },
      resolveLink(href) {
        if (href.startsWith('#')) return { href };
        if (/^https:\/\//.test(href)) return { href, external: true };
        const internal = (slugAndAnchor) => {
          const [slug, anchor] = slugAndAnchor.split('#');
          const target = site.bySlug.get(slug)?.file || GENERATED[slug];
          if (!target) throw new SiteError([`${file}: links to "${slug}", which is not a page`]);
          if (!outputs.has(target)) return { withheld: true };
          return { href: ctx.href(target) + (anchor ? `#${anchor}` : '') };
        };
        if (href.startsWith('page:')) return internal(href.slice(5));
        if (href.startsWith('?page=') && page?.upstream) {
          // A link written for the upstream library's own site. Map it, never guess it.
          const upstreamName = page.upstream.upstreamName;
          const mapped = site.lock.upstreams[upstreamName].linkMap?.[href.slice(6)];
          if (!mapped) throw new SiteError([`${file}: upstream link "${href}" has no entry in sources.lock.json linkMap`]);
          if (mapped.page) return internal(mapped.page);
          const upstream = config.upstream[upstreamName];
          return { href: `${upstream.repo}/blob/${upstream.commit}/${mapped.upstreamPath}`, external: true };
        }
        throw new SiteError([`${file}: unrecognised link "${href}" (use page:section/name, an https URL, or #anchor)`]);
      },
    };
    return ctx;
  };

  const files = new Map();
  const emit = (file, html) => files.set(file, html);

  for (const page of shipped) {
    const ctx = context(page.file, page);
    let body;
    let scripts = ['assets/site.js'];
    if (page.kind === 'studio') {
      body = T.studioPage(page, ctx);
      scripts = ['assets/site.js', 'assets/studio.js'];
    } else if (page.kind === 'register') {
      body = T.registerPage(page, ctx);
    } else if (page.kind === 'workflow') {
      body = T.workflowPage(page, ctx);
    } else if (page.kind === 'adapt') {
      body = T.adaptPage(page, ctx);
      scripts = ['assets/site.js', 'assets/adapt.js'];
    } else if (page.kind === 'map') {
      body = T.mapPage(page, ctx);
      scripts = ['assets/site.js', 'assets/map.js'];
    } else {
      const rendered = renderMarkdown(page.sourceText, {
        resolveLink: ctx.resolveLink,
        evidenceLink: ctx.evidenceLink,
        dropFirstH1: page.origin === 'upstream',
        lineBreaks: page.lineBreaks === true,
      });
      body = page.kind === 'card' ? T.cardPage(page, ctx, rendered) : T.contentPage(page, ctx, rendered);
    }
    // The adaptation page prints as a workflow sheet, so it takes the workflow's print layout too.
    const bodyClass = page.kind === 'adapt' ? 'kind-adapt kind-workflow' : `kind-${page.kind}`;
    emit(page.file, T.layout(ctx, { title: page.title, description: page.summary, body, bodyClass, scripts }));
  }

  {
    const ctx = context('index.html');
    emit('index.html', T.layout(ctx, { title: config.title, description: config.tagline, body: T.homePage(ctx), bodyClass: 'kind-home', scripts: ['assets/site.js'] }));
  }
  if (outputs.has('guide.html')) {
    const ctx = context('guide.html');
    emit('guide.html', T.layout(ctx, { title: 'Six moves', description: 'Six moves for a family or support-person conversation, one card each.', body: T.guidePage(ctx), bodyClass: 'kind-guide', scripts: ['assets/site.js'] }));
    const printCtx = context('guide-print.html');
    const renderedCards = shippedCards.map((card) => {
      const { html } = renderMarkdown(card.sourceText, {
        resolveLink: printCtx.resolveLink,
        evidenceLink: printCtx.evidenceLink,
        headingOffset: 1,
        idPrefix: `move-${card.order}-`,
      });
      return { card, html: T.labelModelLine(html) };
    });
    emit('guide-print.html', T.layout(printCtx, { title: 'Six moves, for printing', description: 'All six move cards on one page.', body: T.guidePrintPage(printCtx, renderedCards), bodyClass: 'kind-bundle', scripts: ['assets/site.js'] }));
  }
  {
    const ctx = context('about/governance.html');
    emit('about/governance.html', T.layout(ctx, { title: 'Governance', description: 'The review ledger for this site.', body: T.governancePage(ctx), bodyClass: 'kind-governance', scripts: ['assets/site.js'] }));
  }
  {
    // Served at whatever address was not found, so its links cannot be relative.
    const ctx = context('404.html', null, { absolute: true });
    emit('404.html', T.layout(ctx, { title: 'Not found', description: 'That page is not here.', body: T.notFoundPage(ctx), bodyClass: 'kind-404' }));
  }

  // No page is written if any page prints a protected name. The check is here as well as in
  // the tests so that a build run on its own cannot produce such a page.
  const named = [...files].map(([file, html]) => [file, findProtected(html, site.protectedTerms)]).filter(([, hits]) => hits.length);
  if (named.length) throw new SiteError(named.map(([file, hits]) => describeHits(file, hits)));

  const indexable = channel === 'public' && config.indexable === true;
  files.set('robots.txt', indexable ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n');

  const report = {
    channel,
    buildId,
    indexable,
    counts: {
      pages: site.pages.length,
      shipped: shipped.length,
      withheld: site.pages.length - shipped.length,
      attested: site.pages.filter((p) => p.state === 'attested').length,
      upstreamAttested: site.pages.filter((p) => p.state === 'upstream-attested').length,
      pending: site.pages.filter((p) => p.state === 'pending').length,
      stale: site.pages.filter((p) => p.state === 'stale').length,
    },
    pages: site.pages.map((page) => ({
      slug: page.slug,
      file: page.file,
      kind: page.kind,
      origin: page.origin,
      state: page.state,
      risk: page.ledger.risk,
      contentHash: page.contentHash,
      shipped: outputs.has(page.file),
    })),
    upstream: [...site.upstreamFiles.values()].map((pin) => ({ key: pin.key, blob: pin.blob, attested: Boolean(pin.attestation), verified: pin.verified })),
    queue: reviewQueue(site.pages).map((page) => ({ slug: page.slug, state: page.state, risk: page.ledger.risk })),
    files: [...files.keys()].sort(),
  };
  files.set('build-report.json', `${JSON.stringify(report, null, 2)}\n`);

  // ── Write ──
  // A previous build's files are removed first. Where the folder does not allow deletion
  // (a synced or protected folder), files are overwritten in place and leftovers are named.
  let cleaned = true;
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {
    cleaned = false;
  }
  for (const [file, content] of files) {
    const target = join(outDir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const assetsDir = join(root, 'src', 'assets');
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  // A script ships only with a page that loads it, so a build without the rehearsal or the
  // adaptation page carries none of their code. Stylesheets always ship.
  const loaded = new Set();
  for (const content of files.values()) {
    for (const [, name] of String(content).matchAll(/<script src="[^"]*assets\/([^"/]+\.js)" defer><\/script>/g)) loaded.add(name);
  }
  const assets = readdirSync(assetsDir).sort().filter((name) => !name.endsWith('.js') || loaded.has(name));
  for (const name of assets) copyFileSync(join(assetsDir, name), join(outDir, 'assets', name));

  report.stale = [];
  if (!cleaned) {
    const expected = new Set([...files.keys(), ...assets.map((name) => `assets/${name}`)]);
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) walk(abs);
        else if (!expected.has(relative(outDir, abs).split('\\').join('/'))) report.stale.push(relative(outDir, abs));
      }
    };
    walk(outDir);
  }
  return report;
}

// ── Command line ──────────────────────────────────────────────────────────────────────
// Run only when this file is the program (not when a test imports it). realpath, because the
// path a shell hands over may go through a symlink that the module URL has already resolved.
if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const channel = flag('--channel') || process.env.SITE_CHANNEL || 'review';
  const outDir = resolve(root, flag('--out') || 'dist'); // a relative --out is taken from the repository root
  const buildId = (process.env.COMMIT_REF || '').slice(0, 7);
  try {
    const report = build({ root, outDir, channel, buildId });
    const c = report.counts;
    console.log(`Built the ${channel} channel into ${relative(process.cwd(), outDir) || '.'}`);
    console.log(`  ${c.shipped} of ${c.pages} teaching pages shipped; ${c.withheld} withheld`);
    console.log(`  attested ${c.attested} · attested upstream ${c.upstreamAttested} · in review ${c.pending} · changed since review ${c.stale}`);
    if (channel === 'public' && c.shipped === 0) console.log('  Nothing is attested yet, so the public site is the shell and the governance page only.');
    if (report.stale.length) console.log(`  Could not clear the output folder; left over from an earlier build: ${report.stale.join(', ')}`);
    if (!existsSync(join(outDir, 'index.html'))) throw new Error('build wrote no index.html');
  } catch (error) {
    console.error(error instanceof SiteError ? error.message : error);
    process.exit(1);
  }
}
