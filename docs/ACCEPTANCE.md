# Acceptance criteria

Every criterion has an id, the test that checks it, and what a test cannot settle. The first table is the design brief's own four-owner acceptance test, line by line. The second lists the criteria this build adds.

`npm test` runs every automated check (85 on 2026-11-16) in about two seconds. The browser checks were run by hand against the review build on 2026-11-15 and again on 2026-11-16 for the new and changed pages (Chromium 1280 and 390 px wide, light and dark, and the workflow's print layout); they are not yet part of `npm test`.

## The brief's acceptance tests

| Owner | The brief asks | Status | Checked by |
|---|---|---|---|
| Clinical faculty | Trace every branch | **Needs a person.** The studio page has a "Read every branch" script listing all 25 positions in reading order, with the six added ones marked | Human review |
| Clinical faculty | Refusal, withdrawal, restricted topics, fear and a solo conversation have valid exits | Routes exist and are reachable. The prototype had no solo-conversation exit; four positions were added | `tests/case.test.mjs` "five required exits", "withdrawal is always one press away" |
| Clinical faculty | Two reasonable moves can advance | Pass | `case.test.mjs` "two different moves advance" |
| Clinical faculty | A privacy miss prompts repair or consultation | Route exists. The prototype had no path where a slip happens; two positions were added | `case.test.mjs` "five required exits" |
| Clinical faculty | No global score or false success | Pass. The validator refuses any scoring property | `case.test.mjs` "the validator refuses the defects" |
| Developer | Validate references, case graph, versioned allowlist and expected build files | Pass | `build.test.mjs`, `case.test.mjs`, `governance.test.mjs` |
| Developer | Retry restores the same facts | Pass. Positions are static text; the shipped data equals the case file | `case.test.mjs` "a retry returns to the same position" |
| Developer | Repeated retry and back/refresh expose no previous learner state | Pass in the browser check: a refresh starts over; nothing in localStorage, sessionStorage, cookies or IndexedDB | Browser check; `no-capture.test.mjs` |
| Developer | Check browser network and storage during rehearsal | Pass in the browser check: 54 button presses, no request outside the site's own files | Browser check; `csp.test.mjs` |
| Accessibility | Keyboard-only users can select, compare, retry and exit | Pass in the browser check: the debrief was reached with Tab, Enter and Space alone | Browser check |
| Accessibility | Screen-reader users can do the same; feedback is announced | **Needs a person.** Focus moves to each position's heading, which is the announcement. Not yet tried with VoiceOver or NVDA | Human check |
| Accessibility | Restore focus | Pass: focus lands on the position heading after every move | Browser check |
| Accessibility | Readable zoom and reflow on iPhone Safari and a desktop browser | Partly. No page overflows at 390 px in Chromium. **Not yet tried on an iPhone or at 200% zoom** | Browser check; human check |
| Resident and supervisor | In the retry and a fresh fictional scene, observe both turns | **Blocked.** There is one scene. A second is needed before the transfer check can run | Pilot |
| Resident and supervisor | When participation is declined, observe the stop | Routes exist (pause; declined meeting) | Pilot |
| Resident and supervisor | Ask patient and support-person advisors where the wording adds pressure | **Needs people.** No advisor has been named | Human review |

## Criteria this build adds

| Id | Criterion | Test |
|---|---|---|
| A1 | The build writes one file per manifest page and is byte-for-byte deterministic | `build.test.mjs` |
| A2 | Every internal link resolves to a built file, and every `#anchor` to an id | `build.test.mjs` |
| A3 | Nothing loads from another host; outbound links are https with `rel="noopener noreferrer"`; the Content-Security-Policy header is exactly the one intended | `csp.test.mjs` |
| A4 | No inline script, inline style or event-handler attribute | `csp.test.mjs` |
| A5 | Shipped scripts store nothing, send nothing and listen to nothing; the only input is the home page's find box | `no-capture.test.mjs` |
| A6 | The rehearsal graph is sound (see above) | `case.test.mjs` |
| A7 | The review gate: one ledger row per page; a reviewed row needs a hash and a named reviewer; changing text, title or dialogue reopens the review; the attest command refuses to run unattended; the hash can be reproduced with `git hash-object` | `governance.test.mjs` |
| A8 | Imported files are byte-identical to their pins, and the upstream attestation hash is re-derived from the bytes shipped here | `governance.test.mjs` |
| A9 | The public build ships attested pages only; with none attested, no teaching page, title or sentence gets out; a review build is marked and asks not to be indexed | `governance.test.mjs`, `build.test.mjs` |
| A10 | Every evidence reference resolves to a register entry with an identifier and a dated source check; no effect size appears on a move card | `evidence.test.mjs` |
| A11 | One h1, a main landmark, a skip link and an unbroken heading outline on every page; every text pairing in use is at least 4.5:1 in the light and dark palettes | `build.test.mjs`, `contrast.test.mjs` |
| A12 | The palette matches the design system value for value, and the site stylesheet introduces no colour | `design-tokens.test.mjs` |
| A13 | Every teaching page shows its review status and none claims more than the ledger gives it; no AI system is named as a reviewer; no email address, phone number or placeholder appears; imported pages carry their attribution | `content-rules.test.mjs` |
| A14 | **Nothing is named.** The protected list holds hashes only. No tracked file, file name or built page in either channel carries a protected term. The build refuses to write any page while one page prints such a term, and no failure message prints the term. A page about a real unit prints no number outside its listed set and names no individual | `deidentify.test.mjs`; the check inside `src/build.mjs` |
| A15 | **The workflow is sound.** Every step has an owner, a trigger and a completion test; every role in scope has a step; every measure checks a step that exists, and the steps no measure watches are recorded; the page shows every field; additions to the source procedure are listed and marked; format names, the decision rule and the five parts agree across the three pages that state them | `workflow.test.mjs` |
| A16 | **The second gate.** A page about a real unit cannot be attested by a clinical review alone: a reviewed row without the three-part release record fails the build, two of three confirmations is not enough, and a release record cannot sit on a pending row or on a page with no gate | `governance.test.mjs` |
| A17 | The licence files, the footer and the owner's switch say the same thing | `content-rules.test.mjs` |

## What no test here establishes

- That any sentence is clinically right. That is the attestation.
- That the rehearsal's wording does not add pressure. That is the lived-experience review.
- That the privacy and disclosure page is right for a given hospital. That is a privacy or legal reader.
- That the pages work with a screen reader, on a phone, or printed. Those are short human checks.
- That the unit workflow matches the procedure it came from word for word. It was copied and re-read, not compared by script (`docs/WORKFLOW_INTAKE.md`).
- That publishing the unit workflow is permitted, or wise. The hashed list keeps names off the page; it cannot tell whether a reader could work out which unit this is. That is the release confirmation.
