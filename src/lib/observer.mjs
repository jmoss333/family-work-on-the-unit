import { esc, escAttr, renderMarkdown } from './render.mjs';

const endings = [
  { id: 'early', label: 'Make a plan' },
  { id: 'correct', label: 'Invite a correction' },
];

export const observerSources = [
  'content/pages/teach-observer-card.md',
  'cases/rowan-sal.case.json',
  'src/lib/observer.mjs',
  'src/assets/observer.js',
];

// Both versions use the same opening line and only the spoken turns of the selected route.
export function observerVersions(caseFile) {
  const opening = caseFile.nodes?.heard?.lines?.find((line) => line.kind === 'speech');
  if (!opening) throw new Error('the observer comparison needs a spoken line at heard');
  return endings.map(({ id, label }) => {
    const replies = caseFile.nodes[id]?.lines?.filter((line) => line.kind === 'speech');
    if (!replies?.length || !caseFile.nodes.heard.choices?.some((choice) => choice.next === id)) {
      throw new Error(`the observer comparison needs a spoken reply on the route from heard to ${id}`);
    }
    return { id, label, turns: [opening, ...replies] };
  });
}

/** Words in a turn, in steps of three up to eight steps: the length of its mark on the turn strip. */
export const turnLength = (text) => Math.min(8, Math.ceil(text.trim().split(/\s+/).length / 3));
/** Whose turn: the case's first or second person by order, or the learner. */
export const turnPerson = (speaker, caseFile) => {
  const index = caseFile.people.findIndex((person) => person.name === speaker);
  return index >= 0 ? String(index + 1) : 'learner';
};

function versionPanel({ id, label, turns }, caseFile) {
  return `<section data-version="${id}" id="version-${id}" aria-labelledby="title-${id}">
<h3 id="title-${id}" class="observer-static-title">${esc(label)}</h3>
<div class="observer-turns" role="group" aria-label="Conversation turns · ${escAttr(label)}" data-turns hidden>
${turns.map(({ speaker, text }, index) => `<button class="observer-turn" type="button" data-turn="${index}" data-person="${turnPerson(speaker, caseFile)}" data-length="${turnLength(text)}" aria-label="Turn ${index + 1}, ${escAttr(speaker)}" aria-pressed="false">${esc(speaker)}</button>`).join('\n')}
</div>
<ol class="observer-transcript">
${turns.map(({ speaker, text }, index) => `<li><strong>${esc(speaker)} · Turn ${index + 1}</strong><p>“${esc(text)}”</p></li>`).join('\n')}
</ol>
</section>`;
}

export function renderObserver(page, ctx, pageHeader) {
  const versions = page.observerVersions;
  const opening = versions[0].turns[0];
  const rehearsal = ctx.resolveLink('page:studio/when-a-friend-answers-first#practice-heard');
  const paper = renderMarkdown(page.sourceText, { resolveLink: ctx.resolveLink, evidenceLink: ctx.evidenceLink, headingOffset: 1 });
  return `<article class="page page--wide">
${pageHeader(page, ctx, { eyebrow: 'Observer seat · Fictional rehearsal', meta: 'Printable observer card and turn comparison' })}
<p class="hero__lead observer-intro">Rowan is the patient. Sal is the friend Rowan chose. Listen to what happens after Sal tries to put Rowan’s request into words.</p>
<div class="studio observer-lab">
<section class="studio__scene rc-card" data-observer aria-labelledby="compare-versions">
<h2 id="compare-versions">Compare two versions</h2>
<blockquote class="speech"><span class="speech__who">${esc(opening.speaker)}</span>“${esc(opening.text)}”</blockquote>
<div class="observer-versions" role="group" aria-label="Choose a version" data-endings hidden>
${versions.map(({ id, label }) => `<button class="rc-btn rc-btn--ghost" type="button" data-ending="${id}" aria-controls="version-${id}" aria-pressed="false">${esc(label)}</button>`).join('\n')}
</div>
<p class="observer-instructions" data-instructions hidden>Follow the turns. Select a speaker to read the line.</p>
${versions.map((version) => versionPanel(version, page.observerCase)).join('\n')}
<div class="observer-line" data-turn-line aria-live="polite" aria-atomic="true" hidden></div>
</section>
<aside class="studio__aside" aria-labelledby="give-observation">
<p class="rc-eyebrow">Try it together</p>
<h2 id="give-observation">Give one observation.</h2>
<ol class="observer-prompts">
<li>Quote the resident’s actual line.</li>
<li>Ask who got to check or correct the meaning.</li>
<li>Invite the resident to try that same moment again.</li>
</ol>
${rehearsal.href ? `<a class="rc-btn rc-btn--calm" href="${escAttr(rehearsal.href)}">Give the resident a turn <span aria-hidden="true">→</span></a>` : ''}
</aside>
</div>
<section class="prose observer-paper" aria-labelledby="observer-paper">
<h2 id="observer-paper">Printable observer card</h2>
<div class="page-actions"><button type="button" class="rc-btn rc-btn--secondary" data-print>Print observer card</button></div>
${paper.html}
</section>
</article>`;
}
