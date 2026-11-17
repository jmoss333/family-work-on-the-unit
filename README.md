# Family Work on the Unit

A companion for residents and attending physicians doing family work on adult inpatient psychiatry units.
Joshua Moss, MD · started 2026-11-15

It is a small static site: short cards to read before a meeting, one fictional rehearsal to practice with a supervisor, a workflow that puts family meetings on a unit's calendar, a page that rewrites that workflow for another unit, a map that shows how all of it fits together, the evidence behind them, and a ledger that says who reviewed what. It is modelled on the [Psychiatry Clerkship Library](https://github.com/jmoss333/psychiatry-clerkship) and reuses that library's review rule: an attestation is bound to the exact text it covers.

**Status: no page has been attested for this site yet.** The repository is public, and two sites are built from it. The published site, <https://family-work-on-the-unit.netlify.app>, comes from `main` and shows nothing but its shell and the governance page until a page is attested. The review site, <https://review--family-work-on-the-unit.netlify.app>, comes from `review` and shows every page, each one marked. `docs/DEPLOY.md` explains the two and how they are set up.

## Run it

Node 20 or later. There is nothing to install.

```bash
npm run build          # review build into dist/ : every page, each one marked
open dist/index.html   # works straight from the file system
npm test               # 115 checks, about twelve seconds
npm run queue          # what is waiting for faculty review, highest risk first
npm run build:public   # what the public would get: attested pages only
```

## The one rule

**The public site ships a page only if a faculty attestation is bound to that page's exact text.**

- Every teaching page has a row in `governance/ledger.json`: `pending` or `reviewed`.
- A reviewed row carries the reviewer's name, the date and a `contentHash`. The hash covers the page's source file and its title and summary; for the adaptation page, whose text is computed, it also covers the script that computes it. Change any of them and the page reads "changed since review" and leaves the public build until it is attested again.
- Only a person attests: `npm run attest -- <slug>` at a terminal. The command refuses to run from a script, a CI job or an AI assistant. Nothing else writes a reviewed row.
- `SITE_CHANNEL=public` (Netlify production) builds attested pages only. `SITE_CHANNEL=review` (previews, branch deploys, local) builds everything with a banner on each page.

With nothing attested, the public build is the empty shell and the governance page. That is the intended starting state.

## What is in the box

| Path | Holds |
|---|---|
| `content/manifest.json` | The single list of pages that exist: title, section, source file, where the text came from |
| `content/cards/` | The six move cards, lifted verbatim from the Astra design brief |
| `content/pages/` | Other pages written for this site |
| `content/maps/` | The map's own few sentences. Everything else on the map is copied by the build from the workflow, one table and the list of pages |
| `content/upstream/` | Files copied byte for byte from the Psychiatry Clerkship Library. **Never edited here** |
| `cases/` | Rehearsals as versioned JSON. Position ids are stable |
| `workflows/` | The unit workflow as data: steps, owners, records, completion tests, measures. Beside it, the rules that rewrite it for another unit |
| `evidence/register.json` | Every study and guideline cited, with identifiers and a dated source check |
| `governance/ledger.json` | The review ledger |
| `governance/sources.lock.json` | Commit and blob pins for imported files, with the upstream attestation they carry |
| `governance/protected-terms.json` | Names the site must not print, kept as hashes |
| `site.config.json` | Title, sections, the front-door links, and the owner's switches |
| `src/` | The build (`build.mjs`), its library, and the stylesheets and scripts that ship |
| `tests/` | The acceptance tests. `docs/ACCEPTANCE.md` maps each to a criterion |
| `tools/` | `attest`, `queue`, `protect-term`, `compare_workflow_source` (the unit workflow against its procedure, which is kept outside this repository), and the one-time intake scripts that produced the Astra-derived files |
| `vendor/marked/` | The Markdown parser, pinned and committed, so a build installs nothing |
| `docs/` | Where the unit workflow's sentences came from, open decisions, acceptance map, deploy steps |

## Review status today

22 teaching pages.

| State | Pages | What it means |
|---|---|---|
| Attested for this site | 0 | Nobody has run `attest` yet |
| Attested upstream | 2 | The playbook and the modalities guide: byte-identical to text reviewed in the Clerkship Library on 2026-09-26 |
| In review | 20 | Six cards, the rehearsal, the boundaries page, the evidence register, the pocket card, the unit workflow with its setup page and its adaptation page, the map, the formats page, and five pages written for this build |

`npm run queue` prints the list with the reason for each.

## Common tasks

**Attest a page.** `npm run build`, read `dist/<slug>.html`, then `npm run attest -- <slug>`. Commit `governance/ledger.json`.

**Honour the upstream attestations.** Set `"acceptUpstreamAttestation": true` in `site.config.json`. The two byte-identical imports then ship publicly, marked "Attested upstream". Everything else still waits.

**Edit a page.** Edit its source. If it was attested, it now reads "changed since review"; batch your edits so one review covers them.

**Add a page.** Write the Markdown, add an entry to `content/manifest.json`, add a `pending` row to `governance/ledger.json`. Link to other pages as `[text](page:section/name)`; the build fails on a link it cannot resolve.

**Cite a study.** Add a record to `evidence/register.json` with a PMID or DOI and a `check` dated the day you compared it with the source. Then write `[D4]` in the text. A reference with no record fails the build.

**Update an imported file.** Copy the new bytes from the Clerkship Library, then update the commit in `site.config.json` and the `blob`, `contentHash` and `topicMetaBlob` in `governance/sources.lock.json`. The build re-derives the upstream hash and fails if anything does not line up.

**Add a rehearsal.** Add a case file and a `studio` page. The build refuses a case that lacks any of the five exits (withdrawal, restricted topic, fear, declined meeting, privacy miss), has a dead end, or carries any score.

**Change the unit workflow.** Edit `workflows/unit-family-meeting.workflow.json`. The build refuses a step nobody owns, a role with no step, and a measure that checks no step. A sentence that is not in the source procedure goes under `additions`, so a reviewer can find it.

**Change what a unit may adapt.** Edit `workflows/unit-family-meeting.adapt.json`: the roles offered for each job, the intervals, and the rules that write them into the workflow. The build refuses a rule that no longer matches the workflow's words. Editing that file, the workflow or `src/assets/adapt.js` reopens the adaptation page's review.

**Change the map.** Its sentences are in `content/maps/how-it-fits.map.json`. Its board follows the workflow file, its step cards are the workflow page's, and its parts follow the table under "The five parts of a meeting" in `content/pages/start-one-spine.md`; edit those and the map follows. The build refuses a table it can no longer read. Editing any of the three files reopens the map's review.

**Protect another name.** `node tools/protect-term.mjs add -`, type one name per line, then Ctrl-D. Only a hash is stored. `node tools/protect-term.mjs scan` checks every file and file name.

## What is never named

The unit the workflow comes from, its institution and affiliates, and the products it uses. The list is in `governance/protected-terms.json` as hashes, the tests check every tracked file and every built page against it, and the build refuses to write a page that prints one. Do not put those names in a comment, a test, a commit message or a file name either. `docs/WORKFLOW_INTAKE.md` says what this protects and what it does not: the pages are de-identified, not anonymous.

## What the site never does

No login, no analytics, no fonts or scripts from another host, no form, no storage, no network request after the page loads, no microphone, no AI endpoint. One page has menus, each a fixed list; nothing can be typed into them and nothing chosen is kept. The map opens one step at a time and can cover its answers for self-testing; it keeps no score and remembers nothing. The Content-Security-Policy in `netlify.toml` forbids all of it and `tests/csp.test.mjs` and `tests/no-capture.test.mjs` check the built files against that policy.

## Design

Built with the ReConnect design system (tokens v2.3, components v2.2): terracotta and teal on warm paper, Georgia for headings, the system body stack. `src/assets/tokens.css` is copied from the system and pinned by a test; `src/assets/site.css` may not introduce a colour. Four pairings in the system fall short of WCAG AA and are avoided or swapped for other tokens from the same system; `tests/contrast.test.mjs` computes every pairing in use, light and dark.

## Licences

Not yet granted. Proposed, pending the owner's confirmation (`docs/DECISIONS.md`, D4): software under the MIT License (`LICENSE`); teaching content under CC BY-NC-SA 4.0 (`LICENSE-content`), the same split as the Psychiatry Clerkship Library. Until the owner confirms, both files open with a PROPOSED paragraph and the author's work here is all rights reserved. Two things already carry a licence: `vendor/marked/` keeps its own MIT licence, and the three pages under `content/upstream/` are CC BY-NC-SA 4.0 as published in the Clerkship Library.

## For AI assistants working here

Read `AGENTS.md` first. The short version: you never sign a page, never edit an imported file, never add a citation you have not checked against its source that day, and never write a protected name anywhere.
