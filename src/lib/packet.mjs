// One file holding the words of every page in a build, for a reader who reviews the site
// from outside it: a second reviewer, a privacy reader, a person with lived experience, or
// another AI model. A site of twenty pages is hard to review by clicking; one file is not.
//
// The packet is made from the pages as built, so it says what a reader of the site sees and
// nothing else. It adds a title page and a line above each page saying where it lives and
// what state its review is in.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (whole, name) => ENTITIES[name]);

/** The words of one built page, as plain text a person can read top to bottom. */
export function pageText(html) {
  let main = (html.match(/<main\b[^>]*>([\s\S]*)<\/main>/) || [null, html])[1];
  main = main
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/g, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/g, '')
    // Decoration a screen reader skips: step numerals and the marks on a board. The words
    // beside each say the same thing.
    .replace(/<span\b[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, '')
    .replace(/<\/span><span\b/g, '</span> · <span')
    // The role cards repeat the sheet's own steps once for each role; a reader of the
    // packet has the sheet. The buttons that print them are kept.
    .replace(/<div class="adapt-cards" data-adapt-cards>[\s\S]*?<\/div>\s*(?=<section class="adapt-sheet")/, '');
  const text = main
    .replace(/<h([1-6])\b[^>]*>/g, (whole, level) => `\n\n${'#'.repeat(Number(level) + 2)} `)
    .replace(/<li\b[^>]*>/g, '\n- ')
    .replace(/<tr\b[^>]*>/g, '\n')
    .replace(/<\/t[hd]>/g, ' | ')
    .replace(/<\/option>\s*/g, '')
    .replace(/<option\b[^>]*>/g, '\n· ')
    .replace(/<button\b[^>]*>/g, ' [button: ')
    .replace(/<\/button>/g, '] ')
    .replace(/<dt\b[^>]*>/g, '\n')
    .replace(/<dd\b[^>]*>/g, ': ')
    .replace(/<\/(?:p|div|section|article|ul|ol|dl|table|h[1-6]|label|select|caption|blockquote|details|summary|header|footer)>/g, '\n')
    .replace(/<(?:p|div|section|article|br|hr|label|select|blockquote)\b[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const STATES = { attested: 'attested', 'upstream-attested': 'attested upstream, for another audience', pending: 'in review, not attested', stale: 'changed since its review, not attested' };

/**
 * @param {{pages: object[], channel: string, buildId?: string}} report what build() returned
 * @param {(file: string) => string} read reads one built file
 * @param {{site: object, base?: string, date: string, commit?: string}} about the site, the
 *        address the pages are served from, the date to print, and the commit they were built from
 * @returns {string} the packet, as Markdown
 */
export function packet(report, read, { site, base = '', date, commit = '' }) {
  const pages = report.pages.filter((page) => page.shipped);
  const address = (page) => `${base.replace(/\/$/, '')}/${page.file.replace(/\.html$/, '')}`;
  const titleOf = (page) => site.pages.find((other) => other.slug === page.slug).title;
  const sectionOf = (page) => {
    const section = site.config.sections.find((item) => item.id === site.pages.find((other) => other.slug === page.slug).section);
    return section ? section.title : '';
  };
  const lines = [
    `# ${site.config.title}: review packet`,
    '',
    `The words of every page in the ${report.channel} build${commit ? `, at commit ${commit}` : ''}, made on ${date}. ${pages.length} pages.`,
    '',
    'Each page below is the text a reader of the site sees, in the order the site lists its pages. A line above each page gives its address and the state of its review. A page that is "in review" has not been attested by faculty and may be wrong. Menus are shown with their options under them; buttons are shown in square brackets.',
    '',
    '## Contents',
    '',
    ...pages.map((page, index) => `${index + 1}. ${titleOf(page)} (${sectionOf(page)}) · ${STATES[page.state] || page.state}`),
  ];
  pages.forEach((page, index) => {
    lines.push('', '---', '', `## Page ${index + 1} of ${pages.length}: ${titleOf(page)}`, '', `Address: ${address(page)}`, `Section: ${sectionOf(page)} · Kind: ${page.kind} · Review: ${STATES[page.state] || page.state} · Risk: ${page.risk.kind}, ${page.risk.level}`, '', pageText(read(page.file)));
  });
  return `${lines.join('\n')}\n`;
}

// ── Findings that come back ───────────────────────────────────────────────────────────
// A reviewer outside the site, human or model, reports each finding with the words it is
// about, copied from the packet. A finding whose words are not on the page it names is not
// about this site: it is put aside before anyone spends time on it.

/** Text as compared: straight quotes and plain dashes, one space, lower case. Words are not touched. */
export const plain = (text) =>
  String(text)
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const KINDS = ['unsafe', 'unclear', 'missing', 'contradiction', 'identifiable', 'tone', 'works-well'];
export const LEVELS = ['high', 'medium', 'low'];

/**
 * @param {object} report a reviewer's findings: {reviewer, lens, findings: [{id, page, quote, kind, severity, what, ...}]}
 * @param {string[]} texts the text of each page of the packet, in the packet's order
 * @returns {{rows: {id, page, ok: boolean, problems: string[]}[], errors: string[]}}
 */
export function checkFindings(report, texts) {
  const errors = [];
  if (!report || typeof report !== 'object' || !Array.isArray(report.findings)) return { rows: [], errors: ['not a findings file: it needs a "findings" list'] };
  for (const key of ['reviewer', 'lens']) if (typeof report[key] !== 'string' || !report[key].trim()) errors.push(`"${key}" is required`);
  const pages = texts.map(plain);
  const seen = new Set();
  const rows = report.findings.map((finding, index) => {
    const problems = [];
    const id = typeof finding?.id === 'string' && finding.id.trim() ? finding.id : `#${index + 1}`;
    if (seen.has(id)) problems.push('its id is used twice');
    seen.add(id);
    const quoted = (page, quote, which) => {
      if (!Number.isInteger(page) || page < 1 || page > pages.length) return problems.push(`${which}: there is no page ${page}`);
      const words = typeof quote === 'string' ? plain(quote) : '';
      if (words.split(' ').length < 4) return problems.push(`${which}: quote at least four words from the page`);
      if (!pages[page - 1].includes(words)) problems.push(`${which}: those words are not on page ${page}`);
      return undefined;
    };
    quoted(finding?.page, finding?.quote, 'quote');
    if (finding?.page2 !== undefined || finding?.quote2 !== undefined) quoted(finding.page2, finding.quote2, 'second quote');
    if (!KINDS.includes(finding?.kind)) problems.push(`"kind" is one of: ${KINDS.join(', ')}`);
    if (!LEVELS.includes(finding?.severity)) problems.push(`"severity" is one of: ${LEVELS.join(', ')}`);
    if (!LEVELS.includes(finding?.confidence)) problems.push(`"confidence" is one of: ${LEVELS.join(', ')}`);
    if (typeof finding?.what !== 'string' || finding.what.trim().length < 20) problems.push('"what" says what is wrong, in a sentence');
    return { id, page: finding?.page, ok: problems.length === 0, problems };
  });
  return { rows, errors };
}

/** The pages of a packet, split back out, in order. */
export function packetPages(text) {
  return text.split(/\n---\n\n## Page \d+ of \d+: /).slice(1);
}
