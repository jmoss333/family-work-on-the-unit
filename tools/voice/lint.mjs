#!/usr/bin/env node
// Hold lines to the voice rules (voice/rules.json).
//
//   node tools/voice/lint.mjs --site                       every clinician line the site already carries
//   node tools/voice/lint.mjs <file.json>                  a scenes deck, a draft, or a script
//   node tools/voice/lint.mjs --say "A line." [--reply] [--present Ari,Devon]
//
// Exit 0 when nothing is refused, 1 when a rule refuses a line, 2 on a file it cannot read.
// --site always exits 0: it reports on text that is already under review and judges nothing.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSite } from '../../src/lib/model.mjs';
import { replyTurns, validateScenes } from '../../src/lib/scenes.mjs';
import { lintSay, lintScript, loadRules, refusals, wordsOf } from '../../src/lib/voice.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const show = (item) => `${item.level === 'refuse' ? 'refuse' : 'advise'} · ${item.rule}: ${item.says}${item.hit ? ` (${item.hit})` : ''}`;

/**
 * Every clinician line the site carries, with what the rules say of it.
 * A card's line and a scene's model line are held as a learner's comparison (reply);
 * a rehearsal's resident lines are not, because some of them are the missteps it teaches from.
 * @returns {{where: string, kind: 'card'|'rehearsal'|'scene', text: string, findings: object[]}[]}
 */
export function siteLines(root) {
  const site = loadSite(root);
  const rules = loadRules(root);
  const out = [];
  for (const card of site.cards) {
    const quote = (card.sourceText.match(/^> (.+)$/m) || [null, ''])[1];
    [...quote.matchAll(/“([^”]+)”/g)].forEach(([, text], index) => out.push({ where: `Move ${card.order}, turn ${index + 1}`, kind: 'card', text, findings: lintSay(text, rules, { reply: true }) }));
  }
  for (const page of site.pages.filter((item) => item.kind === 'studio')) {
    for (const [id, node] of Object.entries(page.caseFile.nodes)) {
      node.lines.filter((line) => line.kind === 'speech' && line.speaker === page.caseFile.learnerRole).forEach((line) => out.push({ where: `${page.caseFile.id}:${id}`, kind: 'rehearsal', text: line.text, findings: lintSay(line.text, rules) }));
    }
  }
  for (const page of site.pages.filter((item) => item.kind === 'scenes')) {
    for (const scene of page.scenesFile.scenes) {
      replyTurns(scene).forEach((line, index) => out.push({ where: `scene ${scene.id}, turn ${index + 1}`, kind: 'scene', text: line.text, findings: lintSay(line.text, rules, { reply: true, present: index === 0 ? scene.people.map((person) => person.name) : [] }) }));
    }
  }
  return out;
}

function main(argv) {
  const rules = loadRules(ROOT);
  if (argv[0] === '--site') {
    const lines = siteLines(ROOT);
    for (const line of lines) {
      console.log(`${line.where}  [${wordsOf(line.text).length} words]  “${line.text}”`);
      for (const item of line.findings) console.log(`    ${show(item)}`);
    }
    const refused = lines.filter((line) => refusals(line.findings).length);
    console.log(`\n${lines.length} lines. ${refused.length} would be refused if offered as the author’s: ${refused.map((line) => line.where).join('; ') || 'none'}.`);
    return 0;
  }
  if (argv[0] === '--say') {
    const present = argv.includes('--present') ? argv[argv.indexOf('--present') + 1].split(',') : [];
    const findings = lintSay(argv[1] || '', rules, { reply: argv.includes('--reply'), present });
    console.log(findings.length ? findings.map(show).join('\n') : 'No rule objects.');
    return refusals(findings).length ? 1 : 0;
  }
  if (!argv[0] || !existsSync(argv[0])) {
    console.error('usage: node tools/voice/lint.mjs --site | <file.json> | --say "A line." [--reply] [--present Name,Name]');
    return 2;
  }
  const file = JSON.parse(readFileSync(argv[0], 'utf8'));
  const site = loadSite(ROOT);
  let refused = 0;
  if (Array.isArray(file.parts)) {
    // A script, bare or inside a draft.
    const findings = lintScript(file, rules);
    console.log(findings.length ? findings.map((item) => `${item.at}: ${show(item)}`).join('\n') : 'No rule objects.');
    refused = refusals(findings).length;
  } else if (file.script) {
    const findings = lintScript(file.script, rules);
    console.log(findings.length ? findings.map((item) => `${item.at}: ${show(item)}`).join('\n') : 'No rule objects.');
    refused = refusals(findings).length;
  } else if (Array.isArray(file.scenes)) {
    // A deck, or a draft whose scenes sit one level down.
    const scenes = file.scenes.map((item) => item.scene || item).filter(Boolean);
    const deck = file.draft ? { ...site.pages.find((page) => page.kind === 'scenes').scenesFile, scenes } : file;
    const problems = validateScenes(deck, { rules, cards: site.cards });
    console.log(problems.length ? problems.join('\n') : `No rule objects to any of ${scenes.length} scenes.`);
    refused = problems.length;
  } else {
    console.error('That file is not a scenes deck, a script or a draft of either.');
    return 2;
  }
  return refused ? 1 : 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
