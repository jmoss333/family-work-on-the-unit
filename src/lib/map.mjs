// The map page: the unit workflow, the meeting and the site's pages on one screen.
//
// The page is drawn from text other pages already carry. Nothing here writes a sentence.
// This module reads three things and refuses to guess at any of them:
//   - who owns each step and who is also involved, from the workflow file;
//   - which move card goes with which part of a meeting, from the table on the page that
//     already says so;
//   - the map's own few sentences (its introduction and its headings), from the map file.
// The page's review covers all three files, so a change to any of them reopens it.

const text = (value) => typeof value === 'string' && value.trim().length > 0;

/** The sentences a map file must carry. Everything else on the page is copied from elsewhere. */
const REQUIRED = [
  ['lead'],
  ['stay', 'title'], ['stay', 'intro'], ['stay', 'hint'], ['stay', 'full'], ['stay', 'adapt'],
  ['recall', 'label'], ['recall', 'prompt'],
  ['meeting', 'title'], ['meeting', 'step'], ['meeting', 'intro'], ['meeting', 'parts', 'page'], ['meeting', 'parts', 'heading'],
  ['rest', 'title'],
];

/** @returns {string[]} problems; empty when the map file fits the workflow */
export function validateMap(map, workflow) {
  const errors = [];
  if (!map || typeof map !== 'object') return ['not an object'];
  if (map.schema !== 1) errors.push('unknown schema (expected 1)');
  if (map.workflow !== workflow.id) errors.push(`drawn for workflow "${map.workflow}", not "${workflow.id}"`);
  for (const path of REQUIRED) {
    const value = path.reduce((holder, key) => (holder && typeof holder === 'object' ? holder[key] : undefined), map);
    if (!text(value)) errors.push(`"${path.join('.')}" is required`);
  }
  if (text(map.meeting?.step) && !workflow.steps.some((step) => step.id === map.meeting.step)) errors.push(`"meeting.step" is "${map.meeting.step}", which is not a step of the workflow`);
  return errors;
}

/**
 * Read the table that follows a heading in a Markdown page: one row per part of a meeting,
 * with the move cards that go with it.
 * @returns {{rows: {part: string, cards: string[], note: string|null}[], errors: string[]}}
 */
export function readParts(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return { rows: [], errors: [`no heading "${heading}"`] };
  const errors = [];
  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break; // the next heading: the table was not under this one
    if (line.trim().startsWith('|')) table.push(line.trim());
    else if (table.length) break;
  }
  if (table.length < 3 || !/^\|[\s:|-]+\|$/.test(table[1])) return { rows: [], errors: [`no table under "${heading}"`] };
  const cells = (line) => line.slice(1, -1).split('|').map((cell) => cell.trim());
  const rows = table.slice(2).map((line, index) => {
    const [part, cards, ...rest] = cells(line);
    const at = `row ${index + 1} under "${heading}"`;
    if (rest.length || cards === undefined) errors.push(`${at}: two columns are expected, a part and its move cards`);
    if (!text(part) || /[[\]*_`<>]/.test(part)) errors.push(`${at}: the part is plain words`);
    const links = [...(cards || '').matchAll(/\[[^\]]*\]\(page:([a-z0-9-]+\/[a-z0-9-]+)\)/g)].map((match) => match[1]);
    const leftover = (cards || '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/[·\s]/g, '');
    if (links.length && leftover) errors.push(`${at}: a cell is either links to move cards or a note, not both`);
    return { part, cards: links, note: links.length ? null : cards || null };
  });
  if (!rows.length) errors.push(`the table under "${heading}" has no rows`);
  return { rows, errors };
}

/** @returns {string[]} problems; empty when every row names move cards and every card has one row */
export function checkParts(rows, cards) {
  const errors = [];
  const known = new Set(cards.map((card) => card.slug));
  const count = new Map();
  for (const row of rows) {
    for (const slug of row.cards) {
      if (!known.has(slug)) errors.push(`"${row.part}" points at "${slug}", which is not a move card`);
      count.set(slug, (count.get(slug) || 0) + 1);
    }
    if (!row.cards.length && !text(row.note)) errors.push(`"${row.part}" has neither a move card nor a note`);
  }
  for (const card of cards) {
    if (!count.has(card.slug)) errors.push(`move card "${card.slug}" has no part`);
    else if (count.get(card.slug) > 1) errors.push(`move card "${card.slug}" is listed under ${count.get(card.slug)} parts`);
  }
  return errors;
}

/**
 * The board: one row per role, one column per step.
 * @returns {{id: string, label: string, cells: ('owns'|'involved'|null)[]}[]}
 */
export function board(workflow) {
  return Object.entries(workflow.roles).map(([id, label]) => ({
    id,
    label,
    cells: workflow.steps.map((step) => (step.owner.includes(id) ? 'owns' : (step.support || []).includes(id) ? 'involved' : null)),
  }));
}
