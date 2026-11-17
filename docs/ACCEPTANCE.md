# Acceptance criteria

Every criterion has an id, the test that checks it, and what a test cannot settle. The first table is the design brief's own four-owner acceptance test, line by line. The second lists the criteria this build adds.

`npm test` runs every automated check (110 on 2026-11-17) in about twelve seconds; most of that is one test that tries every way to fill the adaptation page's six jobs. The browser checks were run by hand against the review build on 2026-11-15, on 2026-11-16 for the new and changed pages (Chromium 1280 and 390 px wide, light and dark, and the workflow's print layout), and on 2026-11-17 for the adaptation page, its board and the map (listed under A18, A19 and A20); they are not yet part of `npm test`.

The deploy runs the tests before it builds, so the tests have to pass in every state the owner may put the repository in, and not only in today's. On 2026-11-17 the whole suite was run against copies of the repository with one page attested, with every page attested, with a mixed set attested, with upstream attestations honoured, with both, with indexing switched on and with the licences confirmed. It passed in each. Before that day's changes it failed as soon as one page was attested (see `docs/DECISIONS.md`, ADR-004).

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
| A1 | The build writes one file per manifest page and is byte-for-byte deterministic. A script ships only with a page that loads it | `build.test.mjs` |
| A2 | Every internal link resolves to a built file, and every `#anchor` to an id | `build.test.mjs` |
| A3 | Nothing loads from another host; outbound links are https with `rel="noopener noreferrer"`; the Content-Security-Policy header is exactly the one intended | `csp.test.mjs` |
| A4 | No inline script, inline style or event-handler attribute | `csp.test.mjs` |
| A5 | Shipped scripts store nothing, send nothing and listen to nothing. The only thing a reader can type into is the home page's find box. The only menus are the adaptation page's, one for each choice its rules declare, none with a name to submit | `no-capture.test.mjs` |
| A6 | The rehearsal graph is sound (see above) | `case.test.mjs` |
| A7 | The review gate: one ledger row per page; a reviewed row needs a hash and a named reviewer; changing text, title or dialogue reopens the review; the attest command refuses to run unattended; the hash can be reproduced with `git hash-object` | `governance.test.mjs` |
| A8 | Imported files are byte-identical to their pins, and the upstream attestation hash is re-derived from the bytes shipped here | `governance.test.mjs` |
| A9 | The public build holds the pages that may ship and no others. With none, no teaching page, title or sentence gets out. The pages the build writes itself (home, ledger, index of moves, not-found) never name a page still in review; an attested page names one only as plain words marked "(in review)", never as a link. A review build is marked and asks not to be indexed | `governance.test.mjs`, `build.test.mjs` |
| A10 | Every evidence reference resolves to a register entry with an identifier and a dated source check; no effect size appears on a move card | `evidence.test.mjs` |
| A11 | One h1, a main landmark, a skip link and an unbroken heading outline on every page; every text pairing in use is at least 4.5:1 in the light and dark palettes | `build.test.mjs`, `contrast.test.mjs` |
| A12 | The palette matches the design system value for value, and the site stylesheet introduces no colour | `design-tokens.test.mjs` |
| A13 | Every teaching page shows its review status and none claims more than the ledger gives it; no AI system is named as a reviewer; no email address, phone number or placeholder appears; imported pages carry their attribution | `content-rules.test.mjs` |
| A14 | **Nothing is named.** The protected list holds hashes only. No tracked file, file name or built page in either channel carries a protected term. The build refuses to write any page while one page prints such a term, and no failure message prints the term. A page about a real unit prints no number outside its listed set and names no individual. The intervals the adaptation page offers are held to their own rule and not added to that set: each is a number of hours or "week", each default is the procedure's own, and the one that is not the procedure's (48) is recorded in the test | `deidentify.test.mjs`; the check inside `src/build.mjs` |
| A15 | **The workflow is sound.** Every step has an owner, a trigger and a completion test; every role in scope has a step; every measure checks a step that exists, and the steps no measure watches are recorded; the page shows every field; additions to the source procedure are listed and marked; format names, the decision rule and the five parts agree across the three pages that state them | `workflow.test.mjs` |
| A16 | **The second gate.** A page about a real unit cannot be attested by a clinical review alone: a reviewed row without the three-part release record fails the build, two of three confirmations is not enough, and a release record cannot sit on a pending row or on a page with no gate | `governance.test.mjs` |
| A17 | The licence files, the footer and the owner's switch say the same thing | `content-rules.test.mjs` |
| A18 | **The adaptation page is sound.** Each rule replaces words that occur exactly once in the workflow, and with nothing changed the sheet is the workflow word for word. Every one of the 70,560 ways to fill the six jobs, and each of the 9 pairs of intervals, reads as prose: no leftover placeholder, no role named twice in one phrase. Every version has its own code, and a code is read only against the lists it was made from. A step is refused exactly when nobody owns it, and the refusal names the step. Only the choices on offer are accepted, and the sheet escapes everything it prints. The page as built has fixed menus that are off until the script runs, each with a label and the steps it changes, and nothing to type. The review covers the rules, the workflow and the script, so changing any of the three reopens the page; and the page is under the release gate. The workflow file's own list of who owns each step agrees with the rules | `adapt.test.mjs`; also `no-capture.test.mjs`, `deidentify.test.mjs`, `contrast.test.mjs` |
| A20 | **The board on the adaptation page is true to the version it sits beside.** As written it is the map's board, row for row. On every thirteenth of the 70,560 versions, each step is given to the roles the choices give it to and to nobody when nobody holds the job, and every role chosen has a row. For each of the different sentences the choices of owners can produce (257 on 2026-11-17), the roles the board finds named in it are the roles a second, separately written reading finds. A step nobody owns is marked down its column and says so in words. The board escapes everything it prints | `adapt.test.mjs` |
| A19 | **The map is a faithful copy.** A role is marked at a step exactly when that step's own words name it. The board as built says what the workflow file says: when each step starts, who owns it, who is also involved, whether anything is written, whether a measure checks it, whether there is more to read. Each step opens to the same words as the workflow page, plus its measure. The formats, the two rules and the parts with their move cards are printed as their sources have them, and every move card is placed once. Every page that ships is one press from the map, and a page that does not ship is neither linked nor, in the map's own lists, named. The page is whole without its script, and the script has no way to put a word on the page. The review covers the map's file, the workflow and the page the parts come from; and the page is under the release gate | `map.test.mjs`; also `no-capture.test.mjs`, `deidentify.test.mjs`, `contrast.test.mjs` |

### A18 in a browser (2026-11-17, Chromium, by hand)

| Checked | Result |
|---|---|
| The menus and buttons come alive when the script runs; a choice redraws the sheet, the status line, the version code and both sentences that carry an interval | Pass |
| A job left unfilled: the step is marked, the print button is off, and printing from the browser's own menu gives the reason and no sheet | Pass |
| A reload, and a return with the Back button, both start over | Pass |
| Nothing in localStorage, sessionStorage or cookies; no request beyond the site's own files; the address does not change | Pass |
| Keyboard only: Tab reaches each menu in step order, an arrow key changes the sheet, and focus stays on the menu | Pass |
| Print: the workflow as written, a version with two changes and a version with all eight changed each fit two pages, Letter and A4 | Pass |
| Print: an attestation banner prints on the workflow as written and is dropped from a changed version; the in-review banner always prints | Pass, by setting the page's state in the browser. No page is attested yet |
| The board (A20): as written it shows seven rows; changing who leads redraws it and its counts; a job left unfilled marks that step's column; "Back to the workflow as written" restores it; it is left out of print; on a phone it scrolls inside its frame with the row labels pinned | Pass. On a 1280 by 900 screen the menus and the whole board together are about 1,080 px tall, so the last rows of the board need a short scroll |
| 390 px and 320 px wide: no sideways scrolling; menus and buttons at least 44 px tall | Pass |
| Script switched off: all eight menus and both buttons are off, a note says why, and the sheet is the workflow as written | Pass |
| A screen reader announces the status line after a choice; the menus are usable with VoiceOver on a phone | **Needs a person.** The status line is a live region; nobody has listened to it |

### A19 in a browser (2026-11-17, Chromium, by hand)

| Checked | Result |
|---|---|
| The steps come alive when the script runs; a step opens its card and marks its column; another step replaces it; pressing it again closes it | Pass |
| Self-testing: all 42 answers on the board and their spoken labels are covered; a pressed step uncovers its own column only; switching it off uncovers everything | Pass |
| A reload, and a return with the Back button, both start over; nothing stored; no request beyond the site's own files; the address does not change | Pass |
| Keyboard only: Tab reaches the self-test button, the board, then steps 1 to 8 in order; Enter and Space open and close; focus stays on the step | Pass |
| 390 px and 320 px wide: the page does not scroll sideways; the board scrolls inside its frame with the row labels pinned; every control at least 44 px tall | Pass |
| Script switched off: all eight cards are open, the board is complete, the steps are plain labels, and the controls that need the script are not shown | Pass |
| Print, even from the middle of a self-test: every card open, nothing covered, the marks printed, no controls | Pass. Six Letter pages; the page is not laid out as a poster |
| The home page door and the navigation both lead to the map | Pass |
| A screen reader reads the board as a table and announces that a step has opened | **Needs a person.** The board is a table with row and column headers and the steps carry `aria-expanded`; nobody has listened to it |

## What no test here establishes

- That any sentence is clinically right. That is the attestation.
- That the rehearsal's wording does not add pressure. That is the lived-experience review.
- That the privacy and disclosure page is right for a given hospital. That is a privacy or legal reader.
- That the pages work with a screen reader, on a phone, or printed. Those are short human checks.
- That the unit workflow matches the procedure it came from word for word. It was copied and re-read, not compared by script (`docs/WORKFLOW_INTAKE.md`).
- That the map teaches. It is a faithful copy of the workflow, drawn as a board; whether a resident learns the workflow faster from it, or from covering it and recalling, has not been tried with a resident.
- That the roles offered for each job are ones that may hold it on a given unit, or that an adapted version is safe to work from. The tests check that every version reads as prose and that no step is left without an owner. A changed version says on its face that nobody has reviewed it.
- That publishing the unit workflow is permitted, or wise. The hashed list keeps names off the page; it cannot tell whether a reader could work out which unit this is. That is the release confirmation.
