// HTML for every kind of page. Plain functions that return strings: no inline styles, no
// inline scripts, no event-handler attributes (the Content-Security-Policy in netlify.toml
// forbids all three, and tests/csp.test.mjs checks the output).
import { STALE_REASON, reviewQueue } from './model.mjs';
import { studioContent } from './studio.mjs';
import { scenesContent } from './scenes.mjs';
import { adaptCore, payload } from './adapt.mjs';
import { board } from './map.mjs';
import { coverage } from './workflow.mjs';
import { esc, escAttr, formatDate } from './render.mjs';

const STATE = {
  attested: { badge: 'rc-badge--success', alert: 'rc-alert--success', label: 'Attested' },
  'upstream-attested': { badge: 'rc-badge--info', alert: 'rc-alert--info', label: 'Attested upstream' },
  pending: { badge: 'rc-badge--warning', alert: 'rc-alert--warning', label: 'In review' },
  stale: { badge: 'rc-badge--warning', alert: 'rc-alert--warning', label: 'Changed since review' },
};

const ORIGIN_NOTE = {
  'astra-brief': 'Drafted with ChatGPT in a design brief (November 15, 2026).',
  'astra-prototype': 'Drafted with ChatGPT (November 15, 2026); six branches were added by Claude.',
  upstream: 'Copied unchanged from a source file in the Psychiatry Clerkship Library that was never attested there.',
  'stated-practice': 'Drafted by Claude from Dr. Moss’s description of his own practice; the wording is not yet his.',
  'new-draft': 'Written by Claude for the review build (November 15, 2026).',
  'unit-procedure': 'Adapted by Claude (November 16, 2026) from the author’s own unit procedure, with the unit, its institution and its products left unnamed.',
  'author-materials': 'Assembled by Claude (November 16, 2026) from Dr. Moss’s own teaching materials; the wording is largely his.',
  'adaptation-tool': 'Built by Claude (November 17, 2026). The sheet is the unit workflow’s own text; the questions, the roles offered for each job and the line between what can change and what stays fixed are Claude’s.',
  'site-map': 'Built by Claude (November 17, 2026) from text other pages already carry: the unit workflow, the five parts and their move cards, and the list of pages. The introduction, the headings and the layout are Claude’s.',
  'voice-kit': 'Drafted by Claude (November 18, 2026) in Dr. Moss’s reported voice and held to written rules for it. The scenes and the people are invented, and the wording is not yet his.',
};

const ORIGIN_SHORT = {
  'astra-brief': 'ChatGPT (design brief)',
  'astra-prototype': 'ChatGPT prototype + Claude branches',
  upstream: 'Clerkship Library, verbatim',
  'stated-practice': 'Claude, from Dr. Moss’s practice',
  'new-draft': 'Claude',
  'unit-procedure': 'Author’s unit procedure, de-identified by Claude',
  'author-materials': 'Author’s teaching materials, assembled by Claude',
  'adaptation-tool': 'Claude; the sheet is the unit workflow’s text',
  'site-map': 'Claude; drawn from text other pages carry',
  'voice-kit': 'Claude, in the author’s reported voice',
};

export const stateBadge = (state) => `<span class="rc-badge ${STATE[state].badge}">${STATE[state].label}</span>`;
const riskText = (risk) => `${risk.kind}, ${risk.level}`;
const short = (hash) => (hash ? hash.slice(0, 10) : '');

export function statusBanner(page, ctx) {
  const row = page.ledger;
  let text;
  if (page.state === 'attested') {
    text = `<strong>Attested.</strong> Reviewed by ${esc(row.by)} on ${formatDate(row.at)}. The review is bound to this exact text.`;
  } else if (page.state === 'stale') {
    text = `<strong>Changed since review.</strong> ${esc(STALE_REASON.replace('{at}', formatDate(row.at)))}`;
  } else if (page.state === 'upstream-attested') {
    const upstream = ctx.site.config.upstream[page.upstream.upstreamName];
    const a = page.upstream.attestation;
    text = `<strong>Attested upstream.</strong> ${esc(a.by)} reviewed this text in the ${esc(upstream.name)} on ${formatDate(a.at)}. This copy is byte-identical to the reviewed text (hash-checked at commit <span class="mono">${esc(upstream.commit.slice(0, 7))}</span>). It has not yet been confirmed for this site.`;
  } else {
    text = `<strong>In review.</strong> ${esc(page.originNote || ORIGIN_NOTE[page.origin])} No faculty member has attested this page.`;
  }
  return `<div class="rc-alert ${STATE[page.state].alert} status-banner" role="note"><p>${text}</p></div>`;
}

// ── Shell ─────────────────────────────────────────────────────────────────────────────
export function layout(ctx, { title, description, body, bodyClass = '', scripts = [] }) {
  const { site, channel } = ctx;
  const config = site.config;
  const noindex = channel === 'review' || config.indexable !== true;
  const nav = ctx.nav
    .filter((item) => ctx.outputs.has(item.file))
    .map((item) => {
      const current = item.file === ctx.file ? ' aria-current="page"' : '';
      return `<li><a href="${escAttr(ctx.href(item.file))}"${current}>${esc(item.label)}</a></li>`;
    })
    .join('');
  const ribbon =
    channel === 'review'
      ? `<div class="review-ribbon" role="note"><p><strong>Review build.</strong> A working draft, not the published site. Pages marked “In review” have not been attested by faculty.${ctx.buildId ? ` Build ${esc(ctx.buildId)}.` : ''}</p></div>\n`
      : '';
  const footLinks = [
    ['about/how-this-site-is-made.html', 'How this site is made'],
    ['about/governance.html', 'Governance'],
  ]
    .filter(([file]) => ctx.outputs.has(file))
    .map(([file, label]) => `<a href="${escAttr(ctx.href(file))}">${label}</a>`)
    .join(' · ');
  const fullTitle = title === config.title ? config.title : `${title} · ${config.title}`;
  return `<!doctype html>
<html lang="${escAttr(config.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<title>${esc(fullTitle)}</title>
<meta name="description" content="${escAttr(description)}">
<link rel="stylesheet" href="${escAttr(ctx.href('assets/tokens.css'))}">
<link rel="stylesheet" href="${escAttr(ctx.href('assets/site.css'))}">
</head>
<body class="${escAttr(bodyClass)}">
<a class="skip-link" href="#main">Skip to content</a>
${ribbon}<header class="site-header">
<div class="site-header__inner">
<a class="brand" href="${escAttr(ctx.href('index.html'))}">${esc(config.title)}</a>
<nav class="site-nav" aria-label="Primary"><ul>${nav}</ul></nav>
</div>
</header>
<main id="main" class="site-main">
${body}
</main>
<footer class="site-footer">
<div class="site-footer__inner">
<p>Educational material for supervised clinicians. It is not clinical guidance for any particular patient and does not replace local policy or protocol.</p>
<p>Every person and exchange on this site is fictional. Do not bring patient information here.</p>
<p>© 2026 ${esc(config.author)}. ${config.licenceConfirmed === true ? 'Teaching content CC BY-NC-SA 4.0; software MIT.' : 'Licence not yet confirmed; all rights reserved for now.'}${footLinks ? ` ${footLinks}` : ''}</p>
</div>
</footer>
${scripts.map((file) => `<script src="${escAttr(ctx.href(file))}" defer></script>`).join('\n')}
</body>
</html>
`;
}

function breadcrumb(page, ctx) {
  const section = ctx.site.sectionById.get(page.section);
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="${escAttr(ctx.href('index.html'))}">Home</a></li><li><a href="${escAttr(ctx.href('index.html'))}#section-${escAttr(section.id)}">${esc(section.title)}</a></li></ol></nav>`;
}

export function pageHeader(page, ctx, { eyebrow, meta }) {
  return `${breadcrumb(page, ctx)}
<p class="rc-eyebrow">${esc(eyebrow)}</p>
<h1 class="page__title">${esc(page.title)}</h1>
<p class="page__meta">${esc(meta)}</p>
${statusBanner(page, ctx)}`;
}

function evidenceBlock(ids, ctx) {
  if (!ids.length) return '';
  const items = ids
    .map((id) => {
      const record = ctx.site.evidenceById.get(id);
      const link = ctx.evidenceLink(id);
      const chip = link.href ? `<a class="ev-ref" href="${escAttr(link.href)}">${id}</a>` : `<span class="ev-ref">${id}</span>`;
      return `<li>${chip} ${esc(record.short)} <span class="note-in-review">· ${esc(ctx.site.register.classes[record.class].label)}</span></li>`;
    })
    .join('\n');
  return `<aside class="ev-block rc-panel" aria-labelledby="ev-heading">
<h2 id="ev-heading">Evidence referred to on this page</h2>
<ul>
${items}
</ul>
</aside>`;
}

function provenance(page, ctx) {
  if (page.origin !== 'upstream') return '';
  const upstream = ctx.site.config.upstream[page.upstream.upstreamName];
  const sourceUrl = `${upstream.repo}/blob/${upstream.commit}/${page.upstream.path}`;
  return `<p class="note-in-review">“${esc(page.title)}” from the ${esc(upstream.name)} by Joshua Moss, MD (<a href="${escAttr(sourceUrl)}" rel="noopener noreferrer">source at commit ${esc(upstream.commit.slice(0, 7))}</a>), licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="noopener noreferrer">${esc(upstream.licence)}</a>. Unmodified.</p>`;
}

const sectionEyebrow = (page, ctx) => ctx.site.sectionById.get(page.section).title;

// ── Content pages ─────────────────────────────────────────────────────────────────────
export function contentPage(page, ctx, rendered) {
  const evidence = [...new Set([...(page.evidence || []), ...rendered.evidence])];
  const print = page.printable ? `<div class="page-actions"><button type="button" class="rc-btn rc-btn--secondary" data-print>Print this page</button></div>` : '';
  return `<article class="page">
${pageHeader(page, ctx, { eyebrow: sectionEyebrow(page, ctx), meta: `${page.minutes} min read` })}
<div class="prose">
${rendered.html}</div>
${evidenceBlock(evidence, ctx)}
${print}
${provenance(page, ctx)}
</article>`;
}

/** The model line (the first blockquote on a card) gets a visible, real label. */
export function labelModelLine(html) {
  return html.replace(/<blockquote>\n?([\s\S]*?)<\/blockquote>/, (whole, inner) => `<figure class="say rc-card rc-card--warm"><figcaption>Try saying</figcaption><blockquote>${inner}</blockquote></figure>`);
}

export function cardPage(page, ctx, rendered) {
  const cards = ctx.site.cards;
  const shipped = cards.filter((card) => ctx.outputs.has(card.file));
  const at = shipped.indexOf(page);
  const prev = shipped[at - 1];
  const next = shipped[at + 1];
  const evidence = [...new Set([...(page.evidence || []), ...rendered.evidence])];
  const practice = page.practice && ctx.outputs.has(ctx.site.bySlug.get(page.practice).file)
    ? `<a class="rc-btn rc-btn--calm" href="${escAttr(ctx.href(ctx.site.bySlug.get(page.practice).file))}">Practice this move</a>`
    : '';
  const moveLink = (card, dir, cls) =>
    card
      ? `<a class="rc-card ${cls}" href="${escAttr(ctx.href(card.file))}"><span class="move-nav__dir">${dir}</span>${card.order}. ${esc(card.title)}</a>`
      : '';
  return `<article class="page">
${pageHeader(page, ctx, { eyebrow: `Move ${page.order} of ${cards.length} · ${page.phase}`, meta: `${page.minutes} min read` })}
<div class="prose prose--card">
${labelModelLine(rendered.html)}</div>
${evidenceBlock(evidence, ctx)}
<div class="page-actions">
${practice}
<button type="button" class="rc-btn rc-btn--secondary" data-print>Print this card</button>
</div>
<nav class="move-nav" aria-label="Other moves">
${moveLink(prev, 'Previous move', 'move-nav__prev')}
${moveLink(next, 'Next move', 'move-nav__next')}
</nav>
</article>`;
}

// ── Practice studio ───────────────────────────────────────────────────────────────────
export function studioPage(page, ctx) {
  const header = pageHeader(page, ctx, { eyebrow: 'Practice studio · Fictional rehearsal', meta: `About ${page.minutes} minutes · Case version ${page.caseFile.version}` });
  return studioContent(page, ctx, header);
}

// ── Fresh scenes ──────────────────────────────────────────────────────────────────────
export function scenesPage(page, ctx) {
  const deck = page.scenesFile;
  const header = pageHeader(page, ctx, { eyebrow: 'Practice studio · Fictional scenes', meta: `${deck.scenes.length} scenes · about ${page.minutes} minutes · Deck version ${deck.version}` });
  return scenesContent(page, ctx, header);
}

// ── Unit workflow ─────────────────────────────────────────────────────────────────────
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const countWord = (n) => NUMBER_WORDS[n] || String(n);

function seeAlso(links, ctx) {
  if (!links?.length) return '';
  const items = links.map((link) => {
    const target = ctx.resolveLink(link.to);
    if (target.withheld) return `${esc(link.label)} <span class="note-in-review">(in review)</span>`;
    return `<a href="${escAttr(target.href)}"${target.external ? ' rel="noopener noreferrer"' : ''}>${esc(link.label)}</a>`;
  });
  return `<p class="wf-step__links"><span class="wf-label">See also</span> ${items.join(' · ')}</p>`;
}

/** A sentence that is not in the source procedure, marked while the page is in review. */
function addedNote(w, id, ctx) {
  const note = (w.additions || []).find((item) => item.id === id);
  if (!note) return '';
  const mark = ctx.channel === 'review' ? ' <span class="rc-badge rc-badge--info">Added in adaptation</span>' : '';
  return `<p class="wf-note">${esc(note.text)}${mark}</p>`;
}

/** One step of the workflow as a card. The workflow page and the map both print it. */
function stepCard(step, number, ctx, { id, classes = '', attributes = '', facts = '', note = '' }) {
  return `<li class="wf-step rc-card${classes}" id="${escAttr(id)}"${attributes}>
<span class="wf-step__n" aria-hidden="true">${number}</span>
<div class="wf-step__body">
<h3><span class="sr-only">Step ${number}: </span>${esc(step.title)}</h3>
<p class="wf-step__who"><span class="rc-badge rc-badge--neutral">${esc(step.ownerLabel)}</span><span>${esc(step.trigger)}</span></p>
<p>${esc(step.action)}</p>${note ? `\n${note}` : ''}
<dl class="wf-facts">
<dt>Written in</dt><dd>${step.record === null ? '<span aria-hidden="true">—</span><span class="sr-only">Nothing is written at this step</span>' : esc(step.record)}</dd>
<dt>Done when</dt><dd>${esc(step.doneWhen)}</dd>${facts}
</dl>
${seeAlso(step.links, ctx)}
</div>
</li>`;
}

/** The menu of formats as cards. `tag` is the heading level that fits where they are printed. */
const formatCards = (w, tag = 'h3') => w.formats.menu.map((format) => `<li class="wf-format rc-card"><${tag}>${esc(format.name)}</${tag}><p>${esc(format.focus)}</p><p class="wf-format__when">${esc(format.when)}</p></li>`).join('\n');

export function workflowPage(page, ctx) {
  const w = page.workflowFile;
  const added = (id) => addedNote(w, id, ctx);
  const numberOf = new Map(w.steps.map((step, index) => [step.id, index + 1]));
  const titleOf = new Map(w.steps.map((step) => [step.id, step.title]));
  const steps = w.steps.map((step, index) => stepCard(step, index + 1, ctx, { id: `step-${step.id}`, note: added(step.note) })).join('\n');
  const formats = formatCards(w);
  const measures = w.measures.list
    .map((measure) => `<tr><td>${esc(measure.name)}</td><td><a href="#step-${escAttr(measure.checksStep)}">Step ${numberOf.get(measure.checksStep)}: ${esc(titleOf.get(measure.checksStep))}</a></td></tr>`)
    .join('\n');
  const adaptation = ctx.site.pages.find((other) => other.kind === 'adapt' && other.workflow === page.workflow && ctx.outputs.has(other.file));
  const adaptLink = adaptation ? `<a class="rc-btn rc-btn--ghost" href="${escAttr(ctx.href(adaptation.file))}">${esc(adaptation.title)}</a>` : '';
  const map = ctx.site.pages.find((other) => other.kind === 'map' && other.workflow === page.workflow && ctx.outputs.has(other.file));
  const mapLink = map ? `<a class="rc-btn rc-btn--ghost" href="${escAttr(ctx.href(map.file))}">${esc(map.title)}</a>` : '';
  const print = page.printable || adaptation || map ? `<div class="page-actions">${page.printable ? '<button type="button" class="rc-btn rc-btn--secondary" data-print>Print this page</button>' : ''}${mapLink}${adaptLink}</div>` : '';
  return `<article class="page">
${pageHeader(page, ctx, { eyebrow: sectionEyebrow(page, ctx), meta: `${w.steps.length} steps · ${page.minutes} min read · Workflow version ${w.version}` })}
<p class="hero__lead">${esc(w.purpose)}</p>
<dl class="wf-frame">
<dt>Scope</dt><dd>${esc(w.scope)}</dd>
<dt>Principle</dt><dd>${esc(w.principle)}</dd>
</dl>
<p class="note-in-review">${esc(w.basis)}</p>

<section class="wf-section" aria-labelledby="wf-steps">
<h2 id="wf-steps">${countWord(w.steps.length)} steps</h2>
<ol class="wf-steps">
${steps}
</ol>
</section>

<section class="wf-section" aria-labelledby="wf-formats">
<h2 id="wf-formats">${countWord(w.formats.menu.length)} formats</h2>
<ol class="wf-formats">
${formats}
</ol>
<p><strong>Decision rule:</strong> ${esc(w.formats.decisionRule)}</p>
<p><strong>No joint meeting today when:</strong> ${esc(w.formats.noJointMeeting)}</p>
${added(w.formats.note)}
</section>

<section class="wf-section" aria-labelledby="wf-guardrails">
<h2 id="wf-guardrails">Guardrails</h2>
<ul class="wf-list">
${w.guardrails.map((line) => `<li>${esc(line)}</li>`).join('\n')}
</ul>
</section>

<section class="wf-section" aria-labelledby="wf-exceptions">
<h2 id="wf-exceptions">When it does not go to plan</h2>
<dl class="wf-exceptions">
${w.exceptions.map((exception) => `<dt>${esc(exception.when)}</dt><dd>${esc(exception.then)}</dd>`).join('\n')}
</dl>
</section>

<section class="wf-section" aria-labelledby="wf-measures">
<h2 id="wf-measures">Proposed measures</h2>
<p>${esc(w.measures.cadence)}</p>
<div class="rc-table-wrap" role="region" aria-label="Proposed measures" tabindex="0"><table class="rc-table">
<thead><tr><th scope="col">Measure</th><th scope="col">Checks</th></tr></thead>
<tbody>
${measures}
</tbody>
</table></div>
<p>${esc(w.measures.baseline)}</p>
${added(w.measures.note)}
</section>

<p class="wf-closing">${esc(w.closing)}</p>
${print}
</article>`;
}

// ── The map ───────────────────────────────────────────────────────────────────────────
// Everything a reader sees here is copied by the build from a file another page already
// draws on, except the few sentences in the map file: the board from the workflow's steps
// and roles, the step cards from the same template as the workflow page, the parts and
// their move cards from the table on the page that states them, and page titles from the
// manifest. A page that does not ship in this build is not named. The script that goes
// with this page shows and hides what is written here; it writes nothing.
export function mapPage(page, ctx) {
  const w = page.workflowFile;
  const map = page.mapFile;
  const { site } = ctx;

  // Every page this map links to. What is left over is listed at the foot, by section.
  const placed = new Set([page.slug]);
  const linkTo = (target, label) => {
    if (!target || !ctx.outputs.has(target.file)) return null;
    placed.add(target.slug);
    return `<a href="${escAttr(ctx.href(target.file))}">${esc(label ?? target.title)}</a>`;
  };
  for (const step of w.steps) {
    for (const item of step.links || []) {
      const target = item.to.startsWith('page:') ? site.bySlug.get(item.to.slice(5).split('#')[0]) : null;
      if (target && ctx.outputs.has(target.file)) placed.add(target.slug);
    }
  }

  // ── Across the stay: the board
  const rows = board(w);
  const { watched } = coverage(w);
  const measureOf = new Map(w.measures.list.map((measure) => [measure.checksStep, measure.name]));
  const cell = (step, inner) => `<td data-step="${escAttr(step.id)}">${inner ? `<span class="map-answer">${inner}</span>` : ''}</td>`;
  const mark = (kind, says) => `<span class="map-mark map-mark--${kind}" aria-hidden="true"></span><span class="sr-only">${says}</span>`;
  const row = (kind, label, each) => `<tr class="map-row map-row--${kind}"><th scope="row">${esc(label)}</th>${w.steps.map((step, index) => cell(step, each(step, index))).join('')}</tr>`;
  const head = w.steps
    .map((step, index) => `<th scope="col" data-step="${escAttr(step.id)}"><button type="button" class="map-step" data-map-step="${escAttr(step.id)}" aria-controls="map-step-${escAttr(step.id)}" disabled><span class="map-step__n" aria-hidden="true">${index + 1}</span><span class="map-step__title"><span class="sr-only">Step ${index + 1}: </span>${esc(step.title)}</span></button></th>`)
    .join('');
  const body = [
    row('when', 'When', (step) => esc(step.trigger)),
    ...rows.map((role) => row('role', role.label, (step, index) => (role.cells[index] === 'owns' ? mark('owns', 'owns this step') : role.cells[index] === 'involved' ? mark('involved', 'also involved') : ''))),
    row('fact', 'Written in', (step) => (step.record === null ? '<span aria-hidden="true">—</span><span class="sr-only">nothing is written</span>' : mark('written', 'written down'))),
    row('fact', 'Measured', (step) => (watched.includes(step.id) ? mark('measured', 'a proposed measure checks it') : '')),
    row('fact', 'See also', (step) => ((step.links || []).length ? mark('more', 'there is more to read or practice') : '')),
  ].join('\n');
  const legend = [['owns', 'owns the step'], ['involved', 'also involved'], ['written', 'something is written down'], ['measured', 'a proposed measure checks it'], ['more', 'more to read or practice']]
    .map(([kind, says]) => `<li><span class="map-mark map-mark--${kind}" aria-hidden="true"></span>${says}</li>`)
    .join('');
  const details = w.steps
    .map((step, index) =>
      stepCard(step, index + 1, ctx, {
        id: `map-step-${step.id}`,
        classes: ' map-detail',
        attributes: ` data-map-detail="${escAttr(step.id)}"`,
        facts: `\n<dt>Measured by</dt><dd>${measureOf.has(step.id) ? esc(measureOf.get(step.id)) : 'No proposed measure'}</dd>`,
        note: addedNote(w, step.note, ctx),
      }),
    )
    .join('\n');
  const workflowPageRef = site.pages.find((other) => other.kind === 'workflow' && other.workflow === page.workflow);
  const adaptRef = site.pages.find((other) => other.kind === 'adapt' && other.workflow === page.workflow);
  const more = [
    [map.stay.full, linkTo(workflowPageRef)],
    [map.stay.adapt, linkTo(adaptRef)],
  ]
    .filter(([, anchor]) => anchor)
    .map(([says, anchor]) => `<span>${esc(says)} ${anchor}</span>`)
    .join(' ');

  // ── Inside the meeting: formats, then the parts and the move card for each
  const meetingStep = w.steps.findIndex((step) => step.id === map.meeting.step) + 1;
  const cardBySlug = new Map(site.cards.map((card) => [card.slug, card]));
  const parts = page.parts
    .map((part) => {
      const cards = part.cards.map((slug) => {
        const card = cardBySlug.get(slug);
        const anchor = linkTo(card);
        if (!anchor) return `<li><span class="map-part__n">Move ${card.order}</span> <span class="note-in-review">(in review)</span></li>`;
        const practice = card.practice ? linkTo(site.bySlug.get(card.practice)) : null;
        return `<li><span class="map-part__n">Move ${card.order}</span> ${anchor} <span class="note-in-review">${card.minutes} min</span>${practice ? `<span class="map-part__practice"><span class="wf-label">Practice</span> ${practice}</span>` : ''}</li>`;
      });
      return `<li class="map-part rc-card"><h4>${esc(part.part)}</h4>${cards.length ? `<ul>${cards.join('')}</ul>` : `<p class="note-in-review">${esc(part.note)}</p>`}</li>`;
    })
    .join('\n');
  const partsSource = linkTo(site.bySlug.get(page.partsPage));

  // ── Everything not yet placed, by section
  const rest = site.config.sections
    .map((section) => {
      const pages = site.pages.filter((other) => other.section === section.id && ctx.outputs.has(other.file) && !placed.has(other.slug));
      if (!pages.length) return '';
      return `<div class="map-rest__group"><h3>${esc(section.title)}</h3><ul>${pages.map((other) => `<li><a href="${escAttr(ctx.href(other.file))}">${esc(other.title)}</a> <span class="note-in-review">· ${other.minutes} min</span></li>`).join('')}</ul></div>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<article class="page page--wide map" data-map-root>
${pageHeader(page, ctx, { eyebrow: sectionEyebrow(page, ctx), meta: `${w.steps.length} steps · ${w.formats.menu.length} formats · ${site.cards.length} moves · ${page.minutes} min` })}
<p class="hero__lead">${esc(map.lead)}</p>

<section class="map-band" aria-labelledby="map-stay">
<h2 id="map-stay">${esc(map.stay.title)}</h2>
<p>${esc(map.stay.intro)}</p>
<div class="map-tools" data-map-tools hidden>
<p class="map-hint">${esc(map.stay.hint)}</p>
<button type="button" class="rc-btn rc-btn--ghost" data-map-recall aria-pressed="false">${esc(map.recall.label)}</button>
</div>
<div class="map-status" role="status"><p class="map-prompt" data-map-prompt hidden>${esc(map.recall.prompt)}</p></div>
<div class="rc-table-wrap map-board-wrap" role="region" aria-labelledby="map-board-caption" tabindex="0">
<table class="map-board">
<caption id="map-board-caption" class="sr-only">Each step of the workflow: when it starts, who owns it, who is also involved, whether anything is written down, whether a proposed measure checks it, and whether there is more to read</caption>
<thead><tr><td></td>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</div>
<ul class="map-legend">${legend}</ul>
${more ? `<p class="map-more">${more}</p>` : ''}
<ol class="wf-steps map-details">
${details}
</ol>
</section>

<section class="map-band" aria-labelledby="map-meeting">
<h2 id="map-meeting">${esc(map.meeting.title)}</h2>
<p>${esc(map.meeting.intro.replace('{n}', String(meetingStep)))}</p>
<h3 class="map-sub">${countWord(w.formats.menu.length)} formats</h3>
<ol class="wf-formats">
${formatCards(w, 'h4')}
</ol>
<p><strong>Decision rule:</strong> ${esc(w.formats.decisionRule)}</p>
<p><strong>No joint meeting today when:</strong> ${esc(w.formats.noJointMeeting)}</p>
${addedNote(w, w.formats.note, ctx)}
<h3 class="map-sub">${esc(map.meeting.parts.heading)}</h3>
<ol class="map-parts">
${parts}
</ol>
${partsSource ? `<p class="wf-note">From ${partsSource}.</p>` : ''}
</section>
${rest ? `
<section class="map-band" aria-labelledby="map-rest">
<h2 id="map-rest">${esc(map.rest.title)}</h2>
<div class="map-rest">
${rest}
</div>
</section>` : ''}
</article>`;
}

// ── Adapt it for your unit ────────────────────────────────────────────────────────────
// The sheet is drawn by src/assets/adapt.js, the same code the browser runs, so the page as
// built and the page after a reader's first choice are made by one implementation.
export function adaptPage(page, ctx) {
  const w = page.workflowFile;
  const spec = page.adaptFile;
  const core = adaptCore();
  // The sheet in the file is drawn from exactly the data the browser is given.
  const given = payload(w, spec);
  const result = core.adapt(given.workflow, given.spec, core.defaults(given.spec));
  const numberOf = new Map(w.steps.map((step, index) => [step.id, index + 1]));
  const list = (numbers) => (numbers.length === 1 ? `Step ${numbers[0]}` : `Steps ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`);
  const stepsOwnedBy = (slot) => Object.entries(spec.owners).filter(([, slots]) => slots.includes(slot)).map(([step]) => numberOf.get(step));
  const stepsTimedBy = (timing) => [...new Set(spec.rules.filter((rule) => rule.at.startsWith('steps.') && rule.replace.includes(`{${timing}}`)).map((rule) => numberOf.get(rule.at.split('.')[1])))];
  const field = (id, question, hint, options, fallback) => `<div class="adapt-field">
<label for="adapt-${escAttr(id)}">${esc(question)}</label>
<select id="adapt-${escAttr(id)}" data-adapt="${escAttr(id)}" data-default="${escAttr(fallback)}" autocomplete="off" aria-describedby="adapt-${escAttr(id)}-hint" disabled>
${options.map(([value, label]) => `<option value="${escAttr(value)}"${value === fallback ? ' selected' : ''}>${esc(label)}</option>`).join('\n')}
</select>
<p class="adapt-field__hint" id="adapt-${escAttr(id)}-hint">${esc(hint)}</p>
</div>`;
  const fields = [
    ...spec.slots.map((slot) => field(slot.id, slot.question, list(stepsOwnedBy(slot.id)), [...slot.options.map((id) => [id, spec.titles[id].label]), ['none', spec.none.label]], slot.default)),
    ...spec.timings.map((timing) => field(timing.id, timing.question, list(stepsTimedBy(timing.id)), timing.options.map((value) => [value, `${timing.prefix} ${value}`]), timing.default)),
    ...(spec.switches || []).map((item) => field(item.id, item.question, list(stepsTimedBy(item.id)), item.options.map((option) => [option.id, option.label]), item.default)),
  ].join('\n');
  const choices = spec.slots.length + spec.timings.length + (spec.switches || []).length;
  const data = JSON.stringify(given).replace(/</g, '\\u003c');
  const legend = [['owns', spec.board.owns], ['involved', spec.board.involved]].map(([kind, says]) => `<li><span class="map-mark map-mark--${kind}" aria-hidden="true"></span>${esc(says)}</li>`).join('');
  return `<article class="page page--wide adapt" data-adapt-root data-refused="false" data-changed="false" data-state="${escAttr(page.state)}">
${pageHeader(page, ctx, { eyebrow: sectionEyebrow(page, ctx), meta: `${choices} choices, each from a fixed list · Workflow version ${w.version}` })}
<p class="hero__lead no-print">${esc(spec.intro)}</p>
<div class="adapt-rules">
<div><h2>You can change</h2><ul>${spec.canChange.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></div>
<div><h2>What stays fixed</h2><ul>${spec.cannotChange.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></div>
</div>
<noscript><p class="rc-alert rc-alert--warning">${esc(spec.messages.noScript)}</p></noscript>
<section class="adapt-controls" aria-labelledby="adapt-your-unit">
<h2 id="adapt-your-unit">Your unit</h2>
<div class="adapt-grid">
${fields}
</div>
<div class="adapt-actions">
<button type="button" class="rc-btn rc-btn--secondary" data-print data-adapt-print disabled>Print your version</button>
<button type="button" class="rc-btn rc-btn--ghost" data-adapt-reset disabled>Back to the workflow as written</button>
</div>
</section>
<p class="adapt-status" id="adapt-status" role="status">${esc(core.status(result, given.spec))}</p>
<section class="adapt-board-section no-print" aria-labelledby="adapt-board-title">
<h2 id="adapt-board-title">${esc(spec.board.title)}</h2>
<p>${esc(spec.board.intro)}</p>
<div class="rc-table-wrap map-board-wrap" role="region" aria-labelledby="adapt-board-title" tabindex="0" data-adapt-board>${core.board(result, given.spec)}</div>
<ul class="map-legend">${legend}</ul>
<p class="adapt-handoffs" data-adapt-handoffs>${esc(core.handoffLine(result, given.spec))}</p>
<h3 class="adapt-cards__title" id="adapt-cards-title">${esc(spec.board.card)}</h3>
<div class="adapt-cards__buttons" role="group" aria-labelledby="adapt-cards-title" data-adapt-card-buttons>${core.cardButtons(result, given.spec, true)}</div>
</section>
<div class="adapt-cards" data-adapt-cards>${core.cards(result, given.spec)}</div>
<section class="adapt-sheet" aria-labelledby="adapt-sheet-title">
<h2 id="adapt-sheet-title">The unit workflow</h2>
<div data-adapt-sheet>
${core.sheet(result, given.spec)}
</div>
</section>
<script type="application/json" id="adapt-data">${data}</script>
</article>`;
}

// ── Evidence register ─────────────────────────────────────────────────────────────────
function citationLine(record) {
  const c = record.citation;
  if (!c) return '';
  const volume = c.volume ? `;${esc(c.volume)}${c.issue ? `(${esc(c.issue)})` : ''}` : c.issue ? `;(${esc(c.issue)})` : '';
  return `<p class="record__cite">${esc(c.authors)}. ${esc(c.title)}. <em>${esc(c.journal)}</em>. ${c.year}${volume}${c.pages ? `:${esc(c.pages)}` : ''}.</p>`;
}

function recordLinks(record) {
  const c = record.citation || {};
  const links = [];
  if (c.pmid) links.push(`<a href="https://pubmed.ncbi.nlm.nih.gov/${escAttr(c.pmid)}/" rel="noopener noreferrer">PubMed ${esc(c.pmid)}</a>`);
  if (c.pmcid) links.push(`<a href="https://pmc.ncbi.nlm.nih.gov/articles/${escAttr(c.pmcid)}/" rel="noopener noreferrer">Full text (${esc(c.pmcid)})</a>`);
  if (c.doi) links.push(`<a href="https://doi.org/${escAttr(c.doi)}" rel="noopener noreferrer">doi:${esc(c.doi)}</a>`);
  for (const link of record.links || []) links.push(`<a href="${escAttr(link.url)}" rel="noopener noreferrer">${esc(link.label)}</a>`);
  return links.length ? `<p class="record__links">${links.join(' · ')}</p>` : '';
}

const SUMMARY_BY = { 'astra-brief': 'Summary drafted with ChatGPT.', claude: 'Summary drafted by Claude.' };

function recordCard(record) {
  const facts = [
    ['Design', record.design],
    ['Setting', record.setting],
    ['Sample', record.sample],
  ].filter(([, value]) => value);
  const notes = record.check.notes.length ? `<ul>${record.check.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>` : '';
  return `<section class="record rc-card" id="${escAttr(record.id)}" aria-labelledby="h-${escAttr(record.id)}">
<h3 id="h-${escAttr(record.id)}"><span class="ev-ref">${esc(record.id)}</span> ${esc(record.short)}</h3>
${citationLine(record)}
${recordLinks(record)}
${facts.length ? `<dl class="record__facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
<p>${esc(record.summary)}</p>
<p class="record__by">${SUMMARY_BY[record.summaryBy]}</p>
<div class="record__check"><strong>Checked ${formatDate(record.check.on)} against ${esc(record.check.source)}.</strong> ${record.check.result === 'matches' ? 'The citation and the figures quoted match the source.' : 'The citation matches the source; see the notes.'}${notes}</div>
</section>`;
}

export function registerPage(page, ctx) {
  const reg = ctx.site.register;
  const groups = Object.keys(reg.classes)
    .map((cls) => {
      const records = reg.records.filter((record) => record.class === cls);
      if (!records.length) return '';
      return `<h2 id="class-${escAttr(cls)}">${esc(reg.classes[cls].label)}</h2>
<p>${esc(reg.classes[cls].blurb)}</p>
${records.map(recordCard).join('\n')}`;
    })
    .join('\n');
  return `<article class="page">
${pageHeader(page, ctx, { eyebrow: sectionEyebrow(page, ctx), meta: `${reg.records.length} entries · ${page.minutes} min read` })}
<div class="prose">
<p>${esc(reg.intro)}</p>
<div class="rc-alert rc-alert--info" role="note"><p><strong>What “checked” means here.</strong> ${esc(reg.checkNote)}</p></div>
<h2 id="how-entries-are-grouped">How the entries are grouped</h2>
<ul class="class-legend">
${Object.entries(reg.classes).map(([cls, info]) => `<li><span class="ev-ref">${esc(cls)}</span><span><a href="#class-${escAttr(cls)}">${esc(info.label)}</a>. ${esc(info.blurb)}</span></li>`).join('\n')}
</ul>
${groups}
<h2 id="what-is-unresolved">What is unresolved</h2>
<p>${esc(reg.unresolved)}</p>
</div>
</article>`;
}

// ── Home ──────────────────────────────────────────────────────────────────────────────
function counts(pages) {
  const by = (state) => pages.filter((page) => page.state === state).length;
  return { total: pages.length, attested: by('attested'), upstream: by('upstream-attested'), pending: by('pending') + by('stale') };
}

function pageItem(page, ctx) {
  const find = `${page.title} ${page.summary} ${ctx.site.sectionById.get(page.section).title} ${page.phase || ''}`.toLowerCase();
  const meta = page.kind === 'card' ? `Move ${page.order} of ${ctx.site.cards.length} · ${page.minutes} min` : page.kind === 'studio' ? `Rehearsal · about ${page.minutes} min` : page.kind === 'scenes' ? `Practice · ${page.scenesFile.scenes.length} scenes · about ${page.minutes} min` : page.kind === 'workflow' ? `Workflow · ${page.workflowFile.steps.length} steps · ${page.minutes} min` : page.kind === 'adapt' ? `Tool · ${page.adaptFile.slots.length + page.adaptFile.timings.length} choices · prints as your version` : page.kind === 'map' ? `Map · ${page.workflowFile.steps.length} steps · ${page.minutes} min` : `${page.minutes} min`;
  return `<li class="page-item rc-card" data-find="${escAttr(find)}">
<div class="page-item__head"><a class="page-item__title" href="${escAttr(ctx.href(page.file))}">${esc(page.title)}</a>${stateBadge(page.state)}</div>
<p>${esc(page.summary)}</p>
<p class="page-item__meta">${esc(meta)}</p>
</li>`;
}

export function homePage(ctx) {
  const { site } = ctx;
  const config = site.config;
  const shipped = site.pages.filter((page) => ctx.outputs.has(page.file));
  const n = counts(shipped);
  const doorTarget = (door) => (door.target === 'guide' ? 'guide.html' : site.bySlug.get(door.target.replace(/^page:/, ''))?.file);
  const doors = config.doors
    .map((door, i) => ({ door, file: doorTarget(door), cls: i === 0 ? 'rc-card--warm' : 'rc-card--tinted' }))
    .filter(({ file }) => file && ctx.outputs.has(file))
    .map(({ door, file, cls }) => `<a class="door rc-card ${cls}" href="${escAttr(ctx.href(file))}"><span class="door__label">${esc(door.label)}</span><span class="door__hint">${esc(door.hint)}</span><span class="door__go" aria-hidden="true">Open →</span></a>`)
    .join('\n');
  const sections = config.sections
    .map((section) => {
      const pages = shipped.filter((page) => page.section === section.id);
      const extra = section.id === 'about' && ctx.outputs.has('about/governance.html')
        ? `<li class="page-item rc-card" data-find="governance ledger review attestation about"><div class="page-item__head"><a class="page-item__title" href="${escAttr(ctx.href('about/governance.html'))}">Governance</a></div><p>The review ledger: who attested what, and what is waiting.</p><p class="page-item__meta">Generated from the ledger</p></li>`
        : '';
      if (!pages.length && !extra) return '';
      return `<section class="lib-section" id="section-${escAttr(section.id)}" aria-labelledby="h-${escAttr(section.id)}">
<h2 id="h-${escAttr(section.id)}">${esc(section.title)}</h2>
<p class="lib-section__blurb">${esc(section.blurb)}</p>
<ul class="page-list">
${pages.map((page) => pageItem(page, ctx)).join('\n')}
${extra}
</ul>
</section>`;
    })
    .join('\n');
  const strip = shipped.length
    ? `<section class="status-strip" aria-label="Review status">
<p><strong>${n.total}</strong> teaching ${n.total === 1 ? 'page' : 'pages'}</p>
<p>${stateBadge('attested')} ${n.attested} for this site</p>
<p>${stateBadge('upstream-attested')} ${n.upstream}</p>
<p>${stateBadge('pending')} ${n.pending}</p>
<p><a href="${escAttr(ctx.href('about/governance.html'))}">See the ledger</a></p>
</section>
<div class="finder">
<label for="find">Find a page</label>
<input id="find" class="rc-search" type="search" autocomplete="off" spellcheck="false" placeholder="Try “pattern”, “confidentiality” or “observer”">
<p id="find-count" class="sr-only" aria-live="polite"></p>
<p id="find-none" class="finder__none" hidden>No pages match. Try a shorter word.</p>
</div>`
    : `<div class="empty-state rc-panel"><h2>Nothing is published yet</h2><p>Pages appear here once a faculty reviewer has attested them. The <a href="${escAttr(ctx.href('about/governance.html'))}">governance page</a> explains how that works.</p></div>`;
  return `<section class="hero">
<p class="rc-eyebrow">${esc(config.audienceLine)}</p>
<h1>${esc(config.title)}</h1>
<p class="hero__lead">${esc(config.tagline)}</p>
${doors ? `<div class="doors">\n${doors}\n</div>` : ''}
</section>
${strip}
${sections}`;
}

// ── Guide index and print bundle ──────────────────────────────────────────────────────
export function guidePage(ctx) {
  const cards = ctx.site.cards.filter((card) => ctx.outputs.has(card.file));
  const spine = ctx.site.bySlug.get('start/one-spine');
  const spineLink = spine && ctx.outputs.has(spine.file) ? ` <a href="${escAttr(ctx.href(spine.file))}">How the moves line up with the playbook and the pocket card.</a>` : '';
  return `<article class="page">
<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="${escAttr(ctx.href('index.html'))}">Home</a></li></ol></nav>
<p class="rc-eyebrow">Prepare for a meeting</p>
<h1 class="page__title">Six moves</h1>
<p class="hero__lead">One card for each move. Each card gives a line to try, when to use it or pause, a common misstep with its repair, and what the evidence does and does not support.${spineLink}</p>
<ol class="move-list">
${cards
  .map(
    (card) => `<li class="move-item rc-card">
<span class="move-item__n" aria-hidden="true">${card.order}</span>
<div>
<a class="move-item__title" href="${escAttr(ctx.href(card.file))}">${esc(card.title)}</a>
<p>${esc(card.summary)}</p>
<p class="move-item__meta"><span class="rc-badge rc-badge--neutral">${esc(card.phase)}</span>${stateBadge(card.state)}</p>
</div>
</li>`,
  )
  .join('\n')}
</ol>
${ctx.outputs.has('guide-print.html') ? `<div class="page-actions"><a class="rc-btn rc-btn--secondary" href="${escAttr(ctx.href('guide-print.html'))}">All six on one page, for printing</a></div>` : ''}
</article>`;
}

export function guidePrintPage(ctx, renderedCards) {
  return `<article class="page">
<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="${escAttr(ctx.href('index.html'))}">Home</a></li><li><a href="${escAttr(ctx.href('guide.html'))}">Six moves</a></li></ol></nav>
<p class="rc-eyebrow">Print bundle</p>
<h1 class="page__title">Six moves, for printing</h1>
<div class="page-actions"><button type="button" class="rc-btn rc-btn--secondary" data-print>Print</button></div>
${renderedCards
  .map(
    ({ card, html }) => `<section class="bundle-card" aria-labelledby="bundle-${card.order}">
<p class="rc-eyebrow">Move ${card.order} of ${ctx.site.cards.length} · ${esc(card.phase)} · ${STATE[card.state].label}</p>
<h2 id="bundle-${card.order}">${esc(card.title)}</h2>
<div class="prose prose--card">
${html}</div>
</section>`,
  )
  .join('\n')}
</article>`;
}

// ── Governance (generated from the ledger; carries no teaching text) ──────────────────
export function governancePage(ctx) {
  const { site, channel } = ctx;
  const shipped = site.pages.filter((page) => ctx.outputs.has(page.file));
  const n = counts(shipped);
  const rows = shipped
    .map((page) => {
      const row = page.ledger;
      const reviewed = page.state === 'attested' ? `${esc(row.by)}, ${formatDate(row.at)}` : page.state === 'upstream-attested' ? `Upstream: ${esc(page.upstream.attestation.by)}, ${formatDate(page.upstream.attestation.at)}` : '—';
      const hash = page.state === 'attested' ? row.contentHash : page.contentHash;
      return `<tr>
<td><a href="${escAttr(ctx.href(page.file))}">${esc(page.title)}</a></td>
<td>${stateBadge(page.state)}</td>
<td>${esc(riskText(row.risk))}</td>
<td>${esc(ORIGIN_SHORT[page.origin])}</td>
<td>${reviewed}</td>
<td><code title="${escAttr(hash)}">${esc(short(hash))}</code></td>
</tr>`;
    })
    .join('\n');
  const queue = channel === 'review'
    ? reviewQueue(site.pages)
        .map((page) => `<li class="rc-card"><div class="queue__head"><a href="${escAttr(ctx.href(page.file))}">${esc(page.title)}</a><span class="rc-badge ${page.ledger.risk.level === 'high' ? 'rc-badge--warning' : 'rc-badge--neutral'}">${esc(riskText(page.ledger.risk))}</span>${stateBadge(page.state)}</div><p>${esc(page.state === 'stale' ? STALE_REASON.replace('{at}', formatDate(page.ledger.at)) : page.ledger.reason)}</p></li>`)
        .join('\n')
    : '';
  const pins = [...site.upstreamFiles.values()]
    .map((pin) => {
      const upstream = site.config.upstream[pin.upstreamName];
      const a = pin.attestation;
      return `<tr>
<td><a href="${escAttr(`${upstream.repo}/blob/${upstream.commit}/${pin.path}`)}" rel="noopener noreferrer"><code>${esc(pin.path)}</code></a></td>
<td><code title="${escAttr(pin.blob)}">${esc(short(pin.blob))}</code></td>
<td>${a ? `${esc(a.by)}, ${formatDate(a.at)}` : 'Never attested upstream'}</td>
<td>${a ? (pin.verified ? '<span class="rc-badge rc-badge--success">Re-derived</span>' : '<span class="rc-badge rc-badge--warning">Mismatch</span>') : '—'}</td>
</tr>`;
    })
    .join('\n');
  const commit = Object.values(site.config.upstream)[0].commit;
  const surfaces = site.config.relatedSurfaces || [];
  const related = surfaces.length
    ? `<section class="gov-section" aria-labelledby="gov-related">
<h2 id="gov-related">Related teaching surfaces</h2>
<ul class="gov-rules">
${surfaces.map((item) => `<li><a href="${escAttr(item.url)}" rel="noopener noreferrer">${esc(item.title)}</a>. ${esc(item.note)}</li>`).join('\n')}
</ul>
</section>`
    : '';
  return `<article class="page page--wide">
<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="${escAttr(ctx.href('index.html'))}">Home</a></li><li><a href="${escAttr(ctx.href('index.html'))}#section-about">About and governance</a></li></ol></nav>
<p class="rc-eyebrow">About and governance</p>
<h1 class="page__title">Governance</h1>
<p class="hero__lead">Who reviewed what on this site, and what is still waiting. This page is generated from the ledger; it carries no teaching text of its own.</p>

<section class="gov-section" aria-labelledby="gov-rules">
<h2 id="gov-rules">How review works here</h2>
<ol class="gov-rules">
<li>Every teaching page has one row in the ledger. A row is either pending or reviewed.</li>
<li>A reviewed row records the reviewer’s name, the date, and a hash of the page’s exact text and title. If any of that changes afterwards, the page shows as changed since review until it is attested again.</li>
<li>Attesting is done by a faculty member, by name, at a terminal. The command refuses to run unattended, and no build step writes a reviewed row.</li>
<li>The public build ships attested pages only. A review build shows everything, with each page marked.</li>
<li>Pages copied from the Psychiatry Clerkship Library are never edited here. The build re-derives the hash the upstream review recorded and fails if the copy differs by one byte.</li>
<li>A page that describes how a real unit works carries a second gate. Before it can be attested, the reviewer confirms by name that it identifies no patient, staff member, unit, hospital or product, that it reports no internal figure, and that it may be published.</li>
<li>The build refuses to write a page that prints a name on the protected list: the unit the workflow comes from, its institution and its products. The list is kept as hashes, so this repository does not spell those names out.</li>
<li>One page computes what it shows: it rewrites the unit workflow with a reader’s own owners and intervals. Its review covers the rules, the workflow and the script that applies them. An attestation is of the workflow as written, so a changed version says it is a local adaptation and does not carry the attestation in print.</li>
<li>One page is a map: the build draws it from the workflow and from text other pages already carry. Its review covers the files it is drawn from, and its script only shows and hides what the build wrote.</li>
<li>One page holds short scenes, each with one possible line for the clinician. The build refuses such a line when it breaks a written rule for what may be offered as the author’s: for example a question that asks why, or a turn that runs long. A rule can only refuse. Whether a line is right is still the faculty review.</li>
</ol>
</section>

<section class="gov-section" aria-labelledby="gov-ledger">
<h2 id="gov-ledger">The ledger</h2>
<p>${n.total} teaching ${n.total === 1 ? 'page' : 'pages'} in this build: ${n.attested} attested for this site, ${n.upstream} attested upstream, ${n.pending} in review.</p>
<div class="rc-table-wrap" role="region" aria-label="Review ledger" tabindex="0"><table class="rc-table gov-table">
<thead><tr><th scope="col">Page</th><th scope="col">Status</th><th scope="col">Risk</th><th scope="col">Drafted by</th><th scope="col">Reviewed</th><th scope="col">Hash</th></tr></thead>
<tbody>
${rows}
</tbody>
</table></div>
</section>
${queue ? `
<section class="gov-section" aria-labelledby="gov-queue">
<h2 id="gov-queue">Waiting for faculty review</h2>
<p>Highest risk first. This list appears in review builds only.</p>
<ol class="queue">
${queue}
</ol>
</section>` : ''}

<section class="gov-section" aria-labelledby="gov-pins">
<h2 id="gov-pins">Files copied from the Psychiatry Clerkship Library</h2>
<p>All taken at commit <code>${esc(commit.slice(0, 12))}</code>. “Re-derived” means the hash recorded by the upstream review was reproduced from the bytes shipped here.</p>
<div class="rc-table-wrap" role="region" aria-label="Upstream files" tabindex="0"><table class="rc-table gov-table">
<thead><tr><th scope="col">File</th><th scope="col">Blob</th><th scope="col">Upstream review</th><th scope="col">Check</th></tr></thead>
<tbody>
${pins}
</tbody>
</table></div>
</section>
${related}
</article>`;
}

export function notFoundPage(ctx) {
  return `<article class="page">
<p class="rc-eyebrow">Not found</p>
<h1 class="page__title">That page is not here</h1>
<p class="hero__lead">It may not have been published yet. Pages appear on this site once a faculty reviewer has attested them.</p>
<div class="page-actions"><a class="rc-btn rc-btn--secondary" href="/">Go to the home page</a></div>
</article>`;
}

