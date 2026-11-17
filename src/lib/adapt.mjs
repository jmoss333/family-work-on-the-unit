// The adaptation page: a reader chooses who does each job and how often, and the workflow
// is rewritten for their unit.
//
// One implementation does the rewriting: src/assets/adapt.js, the script the browser runs.
// The build and the tests load that same file here, in an empty context with no browser
// objects, so the sheet a reader sees is drawn by the code the tests exercised.
//
// The rules are anchored in the workflow's own text. Each rule names a field, the exact
// words it replaces, and what replaces them. validateAdaptation refuses a rule whose words
// are not in the field exactly once, or whose replacement, filled with the defaults, is not
// those same words. So with nothing changed, the adapted sheet is the workflow word for word.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/** The script, as a page source. An adaptation page's review covers it: see model.mjs. */
export const ADAPT_SCRIPT = 'src/assets/adapt.js';
const ASSET = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'adapt.js');
let cached;

/** The browser script's pure functions, loaded without a browser. */
export function adaptCore() {
  if (!cached) {
    const sandbox = {};
    vm.runInNewContext(readFileSync(ASSET, 'utf8'), sandbox, { filename: 'adapt.js' });
    cached = sandbox.FWUAdapt;
  }
  return cached;
}

/**
 * What the page hands the script: the reader's words and the rules, and nothing else.
 * Left out are the fields only the build and the review use (who owns a step in the
 * workflow's own terms, links, and the note on where an added sentence came from, which
 * the workflow page shows in the review channel only).
 */
export function payload(workflow, spec) {
  const pick = (object, keys) => Object.fromEntries(keys.filter((key) => object[key] !== undefined).map((key) => [key, object[key]]));
  return {
    workflow: {
      ...pick(workflow, ['version', 'purpose', 'scope', 'principle', 'basis', 'guardrails', 'closing', 'roles', 'terms']),
      steps: workflow.steps.map((step) => pick(step, ['id', 'title', 'trigger', 'ownerLabel', 'owner', 'action', 'note', 'record', 'doneWhen'])),
      formats: { ...pick(workflow.formats, ['decisionRule', 'noJointMeeting', 'note']), menu: workflow.formats.menu.map((format) => pick(format, ['name', 'focus', 'when'])) },
      exceptions: workflow.exceptions.map((exception) => pick(exception, ['when', 'then'])),
      measures: { ...pick(workflow.measures, ['cadence', 'baseline', 'note']), list: workflow.measures.list.map((measure) => pick(measure, ['name', 'checksStep'])) },
      additions: (workflow.additions || []).map((note) => pick(note, ['id', 'text'])),
    },
    spec: {
      ...pick(spec, ['titles', 'none', 'slots', 'timings', 'owners', 'rules', 'notes', 'messages', 'board']),
      // Where an answer's wording came from is for the reviewer, not the reader.
      switches: (spec.switches || []).map((item) => ({ ...pick(item, ['id', 'code', 'question', 'default']), options: item.options.map((option) => pick(option, ['id', 'label', 'text'])) })),
      rev: revision(workflow, spec),
    },
  };
}

/**
 * Three characters that change whenever a list a version code indexes changes: the workflow's
 * version, and each job's, each interval's and each question's options in order. A code
 * carries them, so a code made from one set of lists is never read against another.
 */
export function revision(workflow, spec) {
  const lists = [workflow.version, spec.slots.map((slot) => [slot.id, slot.code, slot.options]), spec.timings.map((timing) => [timing.id, timing.code, timing.options])];
  if (spec.switches?.length) lists.push(spec.switches.map((item) => [item.id, item.code, item.options.map((option) => option.id)]));
  return createHash('sha256').update(JSON.stringify(lists)).digest('hex').slice(0, 3);
}

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const ID = /^[a-z][a-z0-9-]*$/;
const FORMS = ['label', 'bare', 'phrase', 'person'];

/** @returns {string[]} problems; empty when the adaptation rules fit the workflow */
export function validateAdaptation(spec, workflow) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['not an object'];
  if (spec.schema !== 1) errors.push('unknown schema (expected 1)');
  if (spec.workflow !== workflow.id) errors.push(`written for workflow "${spec.workflow}", not "${workflow.id}"`);
  if (spec.workflowVersion !== workflow.version) errors.push(`written for workflow version ${spec.workflowVersion}; the workflow is at ${workflow.version}. Re-check every rule, then update "workflowVersion".`);
  if (!text(spec.intro)) errors.push('"intro" is required');
  for (const key of ['canChange', 'cannotChange']) {
    if (!Array.isArray(spec[key]) || !spec[key].length || !spec[key].every(text)) errors.push(`"${key}": at least one sentence`);
  }
  for (const key of ['same', 'changed', 'refusedOne', 'refusedMany', 'markSame', 'markChanged', 'local', 'noOwner', 'noScript']) {
    if (!text(spec.messages?.[key])) errors.push(`messages: "${key}" is required`);
  }
  for (const key of ['title', 'intro', 'caption', 'owns', 'involved', 'owned', 'count']) {
    if (!text(spec.board?.[key])) errors.push(`board: "${key}" is required`);
  }

  const titles = spec.titles && typeof spec.titles === 'object' ? spec.titles : {};
  for (const [id, title] of [...Object.entries(titles), ['none', spec.none || {}]]) {
    if (!ID.test(id)) errors.push(`title "${id}": bad id`);
    for (const form of FORMS) if (!text(title[form])) errors.push(`title "${id}": "${form}" is required`);
  }
  if (titles.none) errors.push('"none" is reserved: it means nobody holds the job');

  const slots = Array.isArray(spec.slots) ? spec.slots : [];
  const timings = Array.isArray(spec.timings) ? spec.timings : [];
  const switches = Array.isArray(spec.switches) ? spec.switches : [];
  if (!slots.length) errors.push('no slots');
  const ids = new Set();
  const codes = new Set();
  for (const item of [...slots, ...timings, ...switches]) {
    if (!ID.test(item?.id || '')) errors.push(`"${item?.id}": bad id`);
    if (ids.has(item.id)) errors.push(`"${item.id}": duplicate id`);
    ids.add(item.id);
    if (!/^[A-Z]$/.test(item.code || '') || codes.has(item.code)) errors.push(`"${item.id}": its code is one capital letter, used once`);
    codes.add(item.code);
    if (!text(item.question)) errors.push(`"${item.id}": no question`);
    if (!Array.isArray(item.options) || item.options.length < 2) errors.push(`"${item.id}": at least two options`);
    else if (!item.options.map((option) => option?.id ?? option).includes(item.default)) errors.push(`"${item.id}": its default is not one of its options`);
    if (new Set((item.options || []).map((option) => option?.id ?? option)).size !== (item.options || []).length) errors.push(`"${item.id}": an option is listed twice`);
  }
  // A question's answers are sentences. The default answer is the workflow's own words (the
  // rule that uses it is held to that below); any other answer is new text, and says where
  // it came from so that a reviewer can find it.
  for (const item of switches) {
    for (const option of item.options || []) {
      if (!ID.test(option?.id || '') || !text(option?.label) || !text(option?.text)) errors.push(`question "${item.id}": an answer needs an id, a label and the sentence it prints`);
      else if (option.id !== item.default && !text(option.basis)) errors.push(`question "${item.id}", answer "${option.id}": a sentence that is not the workflow's needs its basis`);
    }
  }
  for (const slot of slots) for (const option of slot.options || []) if (!titles[option]) errors.push(`slot "${slot.id}": unknown title "${option}"`);
  for (const timing of timings) {
    if (!text(timing.prefix)) errors.push(`interval "${timing.id}": no prefix`);
    if (!(timing.options || []).every(text)) errors.push(`interval "${timing.id}": options are short texts`);
  }
  const slotIds = new Set(slots.map((slot) => slot.id));
  const timingIds = new Set(timings.map((timing) => timing.id));
  const switchIds = new Set(switches.map((item) => item.id));

  // An added sentence that is about one title prints only while that title can hold the job.
  // As written it must print, or the sheet would not be the workflow.
  for (const [id, when] of Object.entries(spec.notes || {})) {
    const slot = slots.find((item) => item.id === when?.slot);
    if (!(workflow.additions || []).some((note) => note.id === id)) errors.push(`notes: "${id}" is not one of the workflow's added sentences`);
    if (!slot) errors.push(`notes: "${id}" depends on unknown slot "${when?.slot}"`);
    else if (!Array.isArray(when.among) || !when.among.length || !when.among.every((title) => slot.options.includes(title))) errors.push(`notes: "${id}" lists a title that slot "${slot.id}" does not offer`);
    else if (!when.among.includes(slot.default)) errors.push(`notes: "${id}" would not print on the workflow as written`);
  }

  // Every step has owner slots, and every slot owns a step outright, so that leaving any
  // job unfilled leaves a step with no owner.
  const stepIds = workflow.steps.map((step) => step.id);
  const owners = spec.owners && typeof spec.owners === 'object' ? spec.owners : {};
  if (JSON.stringify(Object.keys(owners)) !== JSON.stringify(stepIds)) errors.push('"owners" must list the workflow\'s steps, in order');
  for (const [step, list] of Object.entries(owners)) {
    if (!Array.isArray(list) || !list.length) errors.push(`owners: step "${step}" has no slot`);
    for (const slot of list || []) if (!slotIds.has(slot)) errors.push(`owners: step "${step}" names unknown slot "${slot}"`);
  }
  for (const slot of slotIds) {
    if (!Object.values(owners).some((list) => Array.isArray(list) && list.length === 1 && list[0] === slot)) errors.push(`slot "${slot}" is the sole owner of no step`);
  }

  if (errors.length) return errors; // the checks below need a well-formed spec

  // The workflow file also says who owns each step, as role ids, for the pages that draw
  // it as a board. Those ids are checked against the rules here, and the rules are checked
  // against the procedure's own owner labels below. So a mark on the board cannot disagree
  // with the words on the page. "team" is the one role that is not a title: a step the team
  // owns names the person who leads it as also involved.
  const TEAM = 'team';
  for (const [role, label] of Object.entries(workflow.roles || {})) {
    if (role === TEAM) continue;
    if (!titles[role]) errors.push(`role "${role}": the workflow uses it, and it is not one of the titles these rules know`);
    else if (titles[role].label !== label) errors.push(`role "${role}": the workflow calls it "${label}"; these rules call it "${titles[role].label}"`);
  }
  for (const step of workflow.steps) {
    const written = [...new Set((owners[step.id] || []).map((slot) => slots.find((item) => item.id === slot).default))].sort();
    const owned = [...(step.owner || [])].sort();
    if (owned.includes(TEAM)) {
      const missing = written.filter((title) => !(step.support || []).includes(title));
      if (owned.length !== 1 || missing.length) errors.push(`step "${step.id}": a step the team owns names who leads it as also involved (${written.join(', ')})`);
    } else if (JSON.stringify(owned) !== JSON.stringify(written)) {
      errors.push(`step "${step.id}": the workflow says it is owned by ${owned.join(' and ') || 'nobody'}; these rules, with nothing changed, say ${written.join(' and ')}`);
    }
  }
  // The workflow lists its roles in the order these rules list their titles, so that the
  // board on the map and the board on the adaptation page list their rows alike.
  const shared = Object.keys(workflow.roles || {}).filter((role) => role !== TEAM);
  if (JSON.stringify(shared) !== JSON.stringify(Object.keys(titles).filter((id) => shared.includes(id)))) errors.push('the workflow lists its roles in a different order from the titles here');
  if (Object.keys(workflow.roles || {}).includes(TEAM) && Object.keys(workflow.roles).at(-1) !== TEAM) errors.push('the workflow lists the team last among its roles');
  if (errors.length) return errors;

  const core = adaptCore();
  const base = core.defaults(spec);
  const tokens = (template) => [...template.matchAll(/\{([a-z-]+)(?:\.([A-Za-z]+))?\}/g)];
  const checkTemplate = (where, template) => {
    if (!text(template)) return errors.push(`${where}: no replacement text`);
    for (const [whole, id, form] of tokens(template)) {
      if (timingIds.has(id)) {
        if (form) errors.push(`${where}: ${whole} is an interval and takes no form`);
      } else if (switchIds.has(id)) {
        if (form) errors.push(`${where}: ${whole} is a question and takes no form`);
      } else if (!slotIds.has(id)) errors.push(`${where}: ${whole} names no slot or interval`);
      else if (form && ![...FORMS, 'Phrase'].includes(form)) errors.push(`${where}: ${whole} uses an unknown form`);
    }
    if (/[{}]/.test(template.replace(/\{[a-z-]+(?:\.[A-Za-z]+)?\}/g, ''))) errors.push(`${where}: a stray brace`);
    return undefined;
  };
  (Array.isArray(spec.rules) ? spec.rules : []).forEach((rule, index) => {
    const where = `rule ${index + 1} (${rule.at})`;
    let place;
    try {
      place = core.locate(workflow, rule.at);
    } catch {
      place = null;
    }
    const field = place?.holder?.[place.key];
    if (typeof field !== 'string') return errors.push(`${where}: no such text in the workflow`);
    if (!text(rule.find)) return errors.push(`${where}: "find" is required`);
    const count = field.split(rule.find).length - 1;
    if (count !== 1) errors.push(`${where}: "${rule.find}" occurs ${count} times in the field; it must occur once`);
    checkTemplate(where, rule.replace);
    // With nothing changed, the replacement that applies (the rule's own, or the first
    // variant that fits the defaults) must be the very words it replaces.
    const asWritten = errors.length ? null : core.fill(spec, base, core.pick(rule, base));
    if (asWritten !== null && asWritten !== rule.find) errors.push(`${where}: with nothing changed it would write "${asWritten}" over "${rule.find}"`);
    for (const [v, variant] of (rule.variants || []).entries()) {
      const at = `${where}, variant ${v + 1}`;
      const kinds = ['none', 'same', 'is'].filter((kind) => variant[kind] !== undefined);
      if (kinds.length !== 1) errors.push(`${at}: exactly one of "none", "same" or "is"`);
      for (const slot of [...(variant.none || []), ...(variant.same || []), ...Object.keys(variant.is || {})]) if (!slotIds.has(slot)) errors.push(`${at}: unknown slot "${slot}"`);
      if (variant.same && variant.same.length !== 2) errors.push(`${at}: "same" compares two slots`);
      for (const [slot, value] of Object.entries(variant.is || {})) if (!titles[value]) errors.push(`${at}: "${slot}" is compared with unknown title "${value}"`);
      checkTemplate(at, variant.replace);
    }
    return undefined;
  });
  if (!Array.isArray(spec.rules) || !spec.rules.length) errors.push('no rules');
  return errors;
}
