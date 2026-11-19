#!/usr/bin/env node
// Draft lines in the author's voice with the Claude API, and hold every drafted line to
// voice/rules.json before a person sees it.
//
//   node tools/voice/draft.mjs scenes --brief voice/briefs/scenes.example.json --dry-run
//   ANTHROPIC_API_KEY=... node tools/voice/draft.mjs scenes --brief <brief.json>
//   ANTHROPIC_API_KEY=... node tools/voice/draft.mjs script --brief <brief.json> [--model claude-sonnet-5-5]
//
//   --dry-run        print the request that would be sent, and send nothing (needs no key)
//   --model <id>     which model drafts (default: see api.mjs)
//   --out <file>     where to write the draft (default: voice/drafts/, which git ignores)
//   --exemplars <f>  the author's lines, from a file kept outside the repository
//   --max-tokens <n> room for the answer
//
// WHAT THIS IS NOT. It is not part of the site, the build or the tests: it refuses to run on
// a build server, and it writes only under voice/drafts/ or outside the repository. A draft
// is a proposal. A person edits it, copies what they keep into a deck, and the faculty
// reviewer attests the page. And it is not for a real conversation: every brief describes
// invented people, and a brief that looks like a record is refused before anything is sent.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSite } from '../../src/lib/model.mjs';
import { ApiError, DEFAULT_MAX_TOKENS, DEFAULT_MODEL, buildRequest, readStructured, send } from './api.mjs';
import { checkScenes, checkScript, draftPath, loadKit, scenesPrompt, screenBrief, scriptPrompt, systemPrompt } from './kit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Everything the command needs from the repository, read once. */
export function context(root, options = {}) {
  const site = loadSite(root);
  const kit = loadKit(root, options);
  const scenesPage = site.pages.find((page) => page.kind === 'scenes');
  if (!scenesPage) throw new Error('the site has no scenes page; a drafted scene needs the deck it would join');
  const deck = scenesPage.scenesFile;
  const taken = [...new Set([...deck.scenes.flatMap((scene) => scene.people.map((person) => person.name)), ...[...site.cases.values()].flatMap((file) => file.people.map((person) => person.name))])];
  return { site, kit, deck, taken, cards: site.cards, protectedTerms: site.protectedTerms };
}

/** The request for a brief, or the reasons it may not be sent. */
export function prepare(brief, ctx, { model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const problems = screenBrief(brief, ctx.kit, ctx);
  if (problems.length) return { problems };
  const user = brief.task === 'scenes' ? scenesPrompt(ctx.kit, brief, ctx.cards) : scriptPrompt(ctx.kit, brief);
  return { problems: [], request: buildRequest({ model, system: systemPrompt(ctx.kit), user, schema: ctx.kit.schemas[brief.task], maxTokens }) };
}

/** A draft file: what was asked, what came back, and what the rules said about it. */
export function assemble(brief, output, ctx, { model, requestId = '', at, usage = null }) {
  const origin = `voice-kit-${at.slice(0, 10)}`;
  const concerns = Array.isArray(output?.concerns) ? output.concerns.filter((item) => typeof item === 'string' && item.trim()) : [];
  const base = { draft: true, status: 'A draft from a model. Not reviewed, not a page. Edit it before you keep any of it.', task: brief.task, model, requestId, at, kit: ctx.kit.fingerprint, brief, concerns, ...(usage ? { usage } : {}) };
  if (brief.task === 'scenes') {
    const scenes = checkScenes(output, brief, { ...ctx, origin });
    return { ...base, scenes, refused: scenes.filter((item) => item.refused.length).length };
  }
  const checked = checkScript(output, brief, ctx.kit);
  // What follows a meeting is not drafted: it is the unit workflow's own sentence, copied.
  const workflow = ctx.site.pages.find((page) => page.kind === 'workflow')?.workflowFile;
  const after = workflow?.steps.find((step) => step.id === 'note')?.action.split('. ')[0];
  return { ...base, script: checked.script, findings: [...checked.refused, ...checked.advice], after: after ? `${after}.` : null, refused: checked.refused.length };
}

export function report(draft) {
  const lines = [];
  if (draft.task === 'scenes') {
    for (const item of draft.scenes) {
      lines.push(`${item.refused.length ? 'REFUSED' : 'ok     '}  ${item.id}${item.scene?.title ? `  “${item.scene.title}”` : ''}`);
      for (const problem of item.refused) lines.push(`           - ${problem}`);
      for (const advice of item.advice) lines.push(`           · ${advice.where}: ${advice.says}${advice.hit ? ` (${advice.hit})` : ''}`);
    }
  } else {
    lines.push(`${draft.refused ? 'REFUSED' : 'ok     '}  ${draft.script.title || 'script'}`);
    for (const item of draft.findings) lines.push(`           ${item.level === 'refuse' ? '-' : '·'} ${item.at}: ${item.says}${item.hit ? ` (${item.hit})` : ''}`);
  }
  for (const concern of draft.concerns) lines.push(`  the model flagged: ${concern}`);
  return lines.join('\n');
}

// ── Command line ──────────────────────────────────────────────────────────────────────
async function main(argv, env) {
  if (env.NETLIFY || env.CI) {
    console.error('This tool drafts with a model, so it never runs on a build server. The site calls no model.');
    return 2;
  }
  const [task, ...rest] = argv;
  const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  if (!['scenes', 'script'].includes(task) || !flag('--brief')) {
    console.error('usage: node tools/voice/draft.mjs scenes|script --brief <file.json> [--dry-run] [--model <id>] [--out <file>] [--exemplars <file>] [--max-tokens <n>]');
    return 2;
  }
  const brief = JSON.parse(readFileSync(flag('--brief'), 'utf8'));
  if (brief.task !== task) {
    console.error(`The brief is for "${brief.task}", and the command asked for "${task}".`);
    return 2;
  }
  const ctx = context(ROOT, { exemplars: flag('--exemplars') });
  const model = flag('--model') || DEFAULT_MODEL;
  const { problems, request } = prepare(brief, ctx, { model, maxTokens: Number(flag('--max-tokens')) || DEFAULT_MAX_TOKENS });
  if (problems.length) {
    console.error(`This brief was not sent:\n  - ${problems.join('\n  - ')}`);
    return 2;
  }
  if (rest.includes('--dry-run')) {
    console.log(JSON.stringify(request, null, 2));
    return 0;
  }
  const at = new Date().toISOString();
  const target = draftPath(ROOT, flag('--out'), `${task}-${at.replace(/[-:]/g, '').slice(0, 15)}.json`);
  const { message, requestId } = await send(request, { env });
  const draft = assemble(brief, readStructured(message), ctx, { model, requestId, at, usage: message.usage });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(draft, null, 2)}\n`);
  console.log(report(draft));
  console.log(`\nWritten to ${relative(process.cwd(), target) || target}. It is a draft: nothing on the site has changed.`);
  return draft.refused ? 3 : 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof ApiError ? `The API answered ${error.status || ''} ${error.type}: ${error.message}${error.requestId ? ` (request ${error.requestId})` : ''}` : error.message || error);
      process.exit(1);
    },
  );
}
