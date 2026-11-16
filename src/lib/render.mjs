// Markdown to HTML, with the three things this site needs that plain Markdown does not give:
// links that are checked at build time, an outline that never skips a heading level, and
// evidence references ([D1], [X2, G3]) that point at the register.
import { posix } from 'node:path';
import { Marked } from '../../vendor/marked/marked.esm.js';

export const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = (value) => esc(value).replace(/"/g, '&quot;');

export function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/g, '-');
  return slug || 'section';
}

/** A relative link from one built file to another, so the site also works from file://. */
export function relHref(fromFile, toFile) {
  const rel = posix.relative(posix.dirname(fromFile), toFile);
  return rel === '' ? posix.basename(toFile) : rel;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

const EVIDENCE_REF = /\[((?:[DXRG]\d+)(?:,\s*[DXRG]\d+)*)\]/g;

/**
 * @param {string} source  Markdown
 * @param {object} options
 * @param {(href: string) => {href?: string, external?: boolean, withheld?: boolean}} options.resolveLink
 *        must throw on a link it does not recognise; a build never ships a guessed link
 * @param {(id: string) => {href: string|null, label: string}} options.evidenceLink
 * @param {boolean} [options.dropFirstH1]  the template prints the page title; an imported
 *        file's own leading "# Title" is dropped from the body so there is one <h1>
 * @param {number} [options.headingOffset]  1 when the body is nested under an <h2> (the print
 *        bundle), so its headings start at <h3>
 * @param {string} [options.idPrefix]  keeps heading ids unique when several bodies share a page
 * @param {boolean} [options.lineBreaks]  keep single line breaks as line breaks. For an
 *        imported file laid out line by line (the pocket card), where editing the source to
 *        add blank lines is not allowed
 * @returns {{html: string, evidence: string[]}}
 */
export function renderMarkdown(source, { resolveLink, evidenceLink, dropFirstH1 = false, headingOffset = 0, idPrefix = '', lineBreaks = false }) {
  const ids = new Map();
  let lastLevel = 1 + headingOffset; // the heading this body sits under (the template's <h1> by default)
  let dropped = false;

  const md = new Marked({ gfm: true, breaks: lineBreaks });
  md.use({
    renderer: {
      heading(text, level, raw) {
        if (level === 1 && dropFirstH1 && !dropped) {
          dropped = true;
          return '';
        }
        // Only the template emits <h1>, and a heading may go at most one level deeper than
        // the one before it. Imported files are never edited, so an outline that skips a
        // level in the source is repaired here, in the rendering, not in the text.
        const effective = Math.min(Math.max(2, level) + headingOffset, lastLevel + 1);
        lastLevel = effective;
        const base = idPrefix + slugify(raw);
        const used = ids.get(base) || 0;
        ids.set(base, used + 1);
        const id = used ? `${base}-${used + 1}` : base;
        return `<h${effective} id="${escAttr(id)}">${text}</h${effective}>\n`;
      },
      link(href, title, text) {
        const target = resolveLink(href);
        if (target.withheld) return `${text} <span class="note-in-review">(in review)</span>`;
        const rel = target.external ? ' rel="noopener noreferrer"' : '';
        return `<a href="${escAttr(target.href)}"${rel}>${text}</a>`;
      },
      table(header, body) {
        return `<div class="rc-table-wrap" role="region" aria-label="Table" tabindex="0"><table class="rc-table">\n<thead>\n${header}</thead>\n<tbody>\n${body}</tbody>\n</table></div>\n`;
      },
    },
  });

  const cited = new Set();
  const html = md.parse(source).replace(EVIDENCE_REF, (whole, list) => {
    const chips = list.split(/,\s*/).map((id) => {
      const link = evidenceLink(id);
      cited.add(id);
      return link.href
        ? `<a class="ev-ref" href="${escAttr(link.href)}" title="${escAttr(link.label)}">${id}</a>`
        : `<span class="ev-ref" title="${escAttr(link.label)}">${id}</span>`;
    });
    return `<span class="ev-refs">${chips.join('')}</span>`;
  });
  return { html, evidence: [...cited] };
}
