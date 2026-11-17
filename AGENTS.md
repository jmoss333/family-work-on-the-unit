# Rules for AI assistants working in this repository

This site teaches clinicians. One faculty reviewer attests every page, and that reviewer's time is the scarce resource. Work that verifies a checkable fact or removes something from the review queue is welcome. Work that adds text to the queue needs a reason.

## Never

1. **Never sign a page.** Do not write `"status": "reviewed"`, a `contentHash`, a `release` record, or a reviewer's name into `governance/ledger.json`, and do not run `tools/attest.mjs`. Attestation is a faculty act. The command refuses to run without a person at a terminal; do not work around that.
2. **Never edit a file under `content/upstream/`.** Those files are pinned byte for byte to a commit of the Psychiatry Clerkship Library, and the attestation they carry depends on it. To update one, re-pin it (README, "Update an imported file").
3. **Never add a citation from memory.** Every reference needs a record in `evidence/register.json` with a PMID or DOI and a `check` dated the day it was compared with the source. In the Clerkship Library, agent-written changes once added 85 citations to reviewed pages; 53 of the 74 that could be checked were misattributed or fabricated. That is why this rule exists.
4. **Never put a real person, a patient detail, or the name of the unit, its institution or its products in any file.** Every person and exchange is invented. This repository is public: the names are kept as hashes in `governance/protected-terms.json`, and they do not belong in content, comments, tests, file names or commit messages. `node tools/protect-term.mjs scan` checks; so do the tests and the build.
5. **Never add a dependency, a third-party request, stored state, a field a reader can type into, an inline script or an inline style.** The site installs nothing, loads nothing from another host and remembers nothing. The adaptation page's menus are fixed lists for that reason.
6. **Never change a value in `src/assets/tokens.css`.** It is the owner's design system. Layout goes in `site.css`, which may use tokens only.
7. **Never put an effect size on a move card.** Odds ratios and numbers needed to treat live in the evidence register, with their setting and dose.
8. **Never add a figure from a real unit to a page marked `"release": "unit-practice"`.** No count, rate, census or result. `tests/deidentify.test.mjs` lists the numbers those pages may print; do not extend the list to make a test pass.

## Always

- Run `npm test` and `npm run build` before proposing a change. A failing test is information; do not weaken a test to pass it.
- Say in the change description which attested pages your edit reopens. Editing an attested page drops it back to "changed since review" and out of the public build; batch edits so one review covers them.
- Mark what you wrote. New pages get an `origin` in `content/manifest.json`; new rehearsal positions get `"origin": "review-build-addition"` or a dated successor; a sentence added to the unit workflow goes under `additions` with its basis. A reviewer must be able to find every line that is not the original author's.
- Keep position ids in a case file stable. A branch-by-branch review refers to them.
- Prefer copying to retyping. The intake scripts in `tools/` exist so that no sentence from a source document is transcribed by hand.

## How the pieces fit

`content/manifest.json` lists the pages. `src/lib/model.mjs` loads everything and refuses inconsistent sources. `src/lib/hash.mjs` defines what an attestation covers. `src/build.mjs` filters by channel and writes `dist/`. `docs/ACCEPTANCE.md` maps each acceptance criterion to the test that checks it and lists the checks only a person can do. `src/assets/adapt.js` is both a shipped script and a source of the adaptation page: the build and the tests run it through `src/lib/adapt.mjs`, and editing it reopens that page's review.
