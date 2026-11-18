import { reviewOrder } from './casegraph.mjs';
import { esc, escAttr } from './render.mjs';

function scriptLine(line, learnerRole) {
  return line.kind === 'speech'
    ? `<p class="speech${line.speaker === learnerRole ? ' speech--learner' : ''}"><span class="speech__who">${esc(line.speaker)}</span>“${esc(line.text)}”</p>`
    : `<p class="narration">${esc(line.text)}</p>`;
}

export function studioContent(page, ctx, header) {
  const c = page.caseFile;
  const order = reviewOrder(c);
  const shortcuts = c.supervision?.shortcuts || [];
  const added = order.filter((id) => c.nodes[id].origin !== 'astra-prototype').length;
  const observerCard = ctx.site.bySlug.get('teach/observer-card');
  const observerLink = observerCard && ctx.outputs.has(observerCard.file)
    ? `<p><a href="${escAttr(ctx.href(observerCard.file))}">Open the observer view and printable card</a></p>`
    : '';
  const script = order
    .map((id) => {
      const node = c.nodes[id];
      const tag = node.origin === 'supervision-review-2026-11-18' ? ' <span class="rc-badge rc-badge--info">Added for paired supervision</span>' : node.origin !== 'astra-prototype' ? ' <span class="rc-badge rc-badge--info">Added in review build</span>' : '';
      const choices = node.choices
        .map((choice) => {
          const mark = choice.origin && node.origin === 'astra-prototype' ? ' <span class="rc-badge rc-badge--info">Added</span>' : '';
          return `<li>“${esc(choice.label)}” → <a href="#position-${escAttr(choice.next)}">${esc(c.nodes[choice.next].title)}</a>${mark}</li>`;
        })
        .join('\n');
      const pause = node.joint ? `<p class="script__note">Joint conversation: “Pause the joint meeting” is available here.</p>` : '';
      const debrief = node.debrief ? `<p class="script__note">This is a debrief position.</p>` : '';
      return `<li class="script__node" id="position-${escAttr(id)}">
<h3>${shortcuts.includes(id) ? `<span id="practice-${escAttr(id)}" data-practice-anchor></span>` : ''}${esc(node.title)} <code>${esc(id)}</code>${tag}</h3>
${node.lines.map((line) => scriptLine(line, c.learnerRole)).join('\n')}
<ul class="script__choices">
${choices}
</ul>
${pause}${debrief}
</li>`;
    })
    .join('\n');
  // "<" is escaped so the data block can never close its own <script> element.
  const data = JSON.stringify({
    start: c.start,
    pauseNode: c.pauseNode,
    learnerRole: c.learnerRole,
    supervision: c.supervision,
    exits: c.exits,
    nodes: Object.fromEntries(
      Object.entries(c.nodes).map(([id, node]) => [id, { title: node.title, joint: node.joint, debrief: Boolean(node.debrief), lines: node.lines, choices: node.choices.map(({ label, next }) => ({ label, next })) }]),
    ),
  }).replace(/</g, '\\u003c');

  return `<article class="page page--wide">
${header}
<p class="hero__lead">${esc(c.intro)}</p>
<div class="studio" data-studio data-static>
<section class="studio__scene rc-card" aria-label="Practice scene">
<p class="rc-eyebrow" id="studio-seat">Resident seat</p>
<h2 id="studio-heading" class="studio__title" tabindex="-1">${esc(c.nodes[c.start].title)}</h2>
<div id="studio-body">
${c.nodes[c.start].lines.map((line) => scriptLine(line, c.learnerRole)).join('\n')}
<p class="narration"><em>The rehearsal runs in your browser and needs JavaScript. Without it, every branch can still be read in the reviewer’s script below.</em></p>
</div>
<div id="studio-choices" class="studio__choices"></div>
<div id="studio-tools" class="studio__tools" hidden></div>
</section>
<aside class="studio__aside" aria-label="Practice together">
${shortcuts.length ? `<h2>Pick a moment to practice</h2>
<ul class="studio__moments">
${shortcuts.map((id) => `<li><a href="#practice-${escAttr(id)}" data-practice="${escAttr(id)}">${esc(c.nodes[id].title)}</a></li>`).join('\n')}
</ul>` : ''}
${observerLink}
<h2>What to listen for</h2>
<p>${esc(c.observer.listenFor)}</p>
<h3>Supervisor prompts</h3>
<ul>
${c.observer.prompts.map((prompt) => `<li>${esc(prompt)}</li>`).join('\n')}
</ul>
<h3>Who’s in the room?</h3>
<p>${esc(c.observer.room)}</p>
<p>Nothing is recorded or saved. Refreshing starts a new rehearsal.</p>
</aside>
</div>
<details class="script rc-panel">
<summary>Read every branch (reviewer’s script)</summary>
<p>All ${order.length} positions in this rehearsal, in the order a reader meets them. ${added} were added during review and are marked.</p>
${c.supervision ? `<h3>How the hand-back works</h3>
<p>Pass to supervisor keeps the spoken prompt for the resident’s next attempt. After a response to Sal’s medication question, hand-back and debrief both return to that question. A pause has its own closing debrief. Private and declined meetings can finish there.</p>
<p>${esc(c.supervision.handoff)}</p>
<ul>${Object.entries(c.supervision.moments).map(([id, prompt]) => `<li>${esc(c.nodes[id].title)} — ${esc(prompt)}</li>`).join('')}</ul>` : ''}
<ol class="script__list">
${script}
</ol>
</details>
<script type="application/json" id="case-data">${data}</script>
</article>`;
}
