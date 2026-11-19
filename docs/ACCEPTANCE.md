# Acceptance criteria

Every criterion has an id, the test that checks it, and what a test cannot settle. The first table is the design brief's own four-owner acceptance test, line by line. The second lists the criteria this build adds.

`npm test` runs every automated check (159 on 2026-11-18) in about sixteen seconds; most of that is one test that tries every way to fill the adaptation page's six jobs. The browser checks were run by hand against the review build on 2026-11-15, on 2026-11-16 for the new and changed pages (Chromium 1280 and 390 px wide, light and dark, and the workflow's print layout), and on 2026-11-17 for the adaptation page, its board, its role cards and the map (listed under A18, A19, A20 and A22); they are not yet part of `npm test`.

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
| Resident and supervisor | In the retry and a fresh fictional scene, observe both turns | **Ready to try; not yet tried.** “Fresh scenes, one turn each” holds a new scene for each move, in review (A27). There is still one full rehearsal. Whether the skill carries over is the pilot | Pilot |
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
| A18 | **The adaptation page is sound.** Each rule replaces words that occur exactly once in the workflow, and with nothing changed the sheet is the workflow word for word. Every one of the 70,560 ways to fill the six jobs, and each of the 18 ways to set the two intervals and answer the question about the drafting tool, reads as prose: no leftover placeholder, no role named twice in one phrase. Every version has its own code, and a code is read only against the lists it was made from. The line on a resident's supervision prints exactly when a resident can lead, and a sentence that is not the workflow's own carries its basis. A step is refused exactly when nobody owns it, and the refusal names the step. Only the choices on offer are accepted, and the sheet escapes everything it prints. The page as built has fixed menus that are off until the script runs, each with a label and the steps it changes, and nothing to type. The review covers the rules, the workflow and the script, so changing any of the three reopens the page; and the page is under the release gate. The workflow file's own list of who owns each step agrees with the rules | `adapt.test.mjs`; also `no-capture.test.mjs`, `deidentify.test.mjs`, `contrast.test.mjs` |
| A20 | **The board on the adaptation page is true to the version it sits beside.** As written it is the map's board, row for row. On every thirteenth of the 70,560 versions, each step is given to the roles the choices give it to and to nobody when nobody holds the job, and every role chosen has a row. For each of the different sentences the choices of owners can produce (111 on 2026-11-17), the roles the board finds named in it are the roles a second, separately written reading finds; and wherever a step says "the meeting lead", whoever owns the meeting is marked. A step nobody owns is marked down its column and says so in words. The board escapes everything it prints. Under it, one sentence says how often the work changes hands and after which steps: for every one of the 70,560 versions that count is worked out a second time from the choices, a version with a step nobody owns says nothing, and of the 25,200 versions that print none has fewer than two handoffs or more than five | `adapt.test.mjs` |
| A21 | **The workflow is held to its comparison with the procedure.** Every sentence of the workflow a reader sees is either the sentence that was found in the procedure, word for word and in its place, or is listed with the reason it differs; every added sentence is on that list. A sentence changed, added or dropped after the comparison fails the suite. The comparison finds a sentence only where the procedure has it: not under another step, not with different capitals, not through a product name unless the substitution is recorded. The tool refuses a procedure kept inside the repository and does not write the record unless asked. The comparison with the real procedure cannot run here; see below | `source-check.test.mjs` |
| A22 | **A role's card says only what the sheet says.** There is one card for each row of the board, in its order. A card holds exactly the steps the board marks for that role, each the sheet's step tag for tag with one line added that says whether the role owns it; around them, the version line, the role's name, where the workflow comes from, the guardrails, the exceptions and the closing line, and nothing else. On every thirteenth of the 70,560 versions the cards match the board's rows and marks. A version with a step nobody owns has no cards and its buttons are off. As the page is built every card button is off, and the cards as written are in the page. Cards escape everything they print | `adapt.test.mjs` |
| A23 | **A review from outside is given the site's own words, and its findings are checked against them.** The review packet holds every page of the review build, in the site's order, each page's text exactly as the built page has it, with its address and the state of its review; it carries no markup and no data block, and the unit workflow is in it whole. A finding that comes back must quote words that are on the page it names; typography is forgiven and a changed word is not. The check exits 1 on a finding the site does not bear out | `outside-review.test.mjs` |
| A24 | **The design pass changes how pages look and nothing they say.** No stylesheet puts a letter or digit on a page through `content`. The pass sits entirely inside `@media screen`. The empty turn is listed for exactly the case positions whose closing line asks the resident to speak. On the map, the breaks in the board's lines are the handoffs of the workflow as written; on every thirteenth adaptation version they are the handoffs the page states, and in a version with a step nobody owns, every other break touches that step | `margin.test.mjs`; also `contrast.test.mjs` (the note and speaker pairings) |
| A25 | **The room and the turn strip are drawn from the case.** The room lists one seat for each person, the learner and the supervisor, under the aside's own heading. The rule for who is present travels in the data block, and the room never shows a speaker away; a position not marked joint does not seat the person invited to the joint meeting. The script sets the room at every position, at the hand-back and at the end. Without the script the room is not shown. Each mark on the observer's strip carries its turn's speaker and length, in the transcript's order | `room.test.mjs`; also `contrast.test.mjs` |
| A26 | **The voice is written down, and the tool that drafts in it never ships.** The rules file declares exactly the rules the checker applies. Each rule that refuses a spoken line catches the fault it names and only that fault; a phrase is matched whole, so an innocent word is not refused for what it contains. The author's own lines pass every rule that refuses, and each says how close it is to speech. The rules refuse none of the 32 clinician lines the site carries, and cannot tell the rehearsal's four missteps from its good lines. A script is held to its five parts, a question in each, and one idea in thirty minutes. A brief is screened before anything is sent: invented people, no shape a record has, no protected name, nothing a short scene cannot hold, and only a meeting the patient was asked about. The request is the one the API reference describes, with a schema the API accepts, no sampling setting and no key; an answer is read past its thinking; a rate limit that says when is retried and a spending cap is not; no error prints the key. What comes back is held to the deck's own rules and marked as a draft, and is written under `voice/drafts/` or outside the repository. The command refuses to run on a build server. Only the drafting tool names the API, and nothing under `src/` imports it, opens a connection or reads a key. The live API cannot be reached from the tests; see below | `voice.test.mjs` |
| A27 | **Fresh scenes are sound, closed and need no script.** The deck holds one scene for each move card, each marked with its origin, with people no other case uses. Its instruction and its pause are sentences the site already carries. The validator refuses a deck that is not fictional, a speaker who is not in the room, the learner speaking in the opening, an opening that runs long, a scoring property, and a model line that is not one or two turns by the learner or that breaks a rule of the voice; it refuses a scene that touches what would need an exit. The page prints the deck, the move each scene practises and one label of its own. Each comparison is closed as built and holds exactly the model line, and nothing speaks for the resident before it. The page loads the site script and no other, carries no data block, and takes no typing. A move that does not ship is named as plain words marked “(in review)”. The review covers the deck and its renderer; a rule is not a source, and a rule the deck no longer meets stops the build. On a screen the turn is the rehearsal's empty turn; on paper it is a ruled line, and a closed comparison is not printed | `scenes.test.mjs`; also `build.test.mjs`, `csp.test.mjs`, `no-capture.test.mjs`, `governance.test.mjs` |
| A19 | **The map is a faithful copy.** A role is marked at a step exactly when that step's own words name it. The board as built says what the workflow file says: when each step starts, who owns it, who is also involved, whether anything is written, whether a measure checks it, whether there is more to read. Each step opens to the same words as the workflow page, plus its measure. The formats, the two rules and the parts with their move cards are printed as their sources have them, and every move card is placed once. Every page that ships is one press from the map, and a page that does not ship is neither linked nor, in the map's own lists, named. The page is whole without its script, and the script has no way to put a word on the page. The review covers the map's file, the workflow and the page the parts come from; and the page is under the release gate | `map.test.mjs`; also `no-capture.test.mjs`, `deidentify.test.mjs`, `contrast.test.mjs` |

### A18 in a browser (2026-11-17, Chromium, by hand)

| Checked | Result |
|---|---|
| The menus and buttons come alive when the script runs; a choice redraws the sheet, the status line, the version code and both sentences that carry an interval | Pass |
| A job left unfilled: the step is marked, the print button is off, and printing from the browser's own menu gives the reason and no sheet | Pass |
| A reload, and a return with the Back button, both start over | Pass |
| Nothing in localStorage, sessionStorage or cookies; no request beyond the site's own files; the address does not change | Pass |
| Keyboard only: Tab reaches each menu in step order, an arrow key changes the sheet, and focus stays on the menu | Pass |
| Print: the workflow as written, a version with two changes, a version with all nine changed and the longest sheet the page can make (every job changed, a resident leading, the tool drafting) each fit two pages, Letter and A4 | Pass |
| Answering "No" to the drafting tool rewrites step 7 and nothing else; an APP as lead drops the line on a resident's supervision, a resident as lead keeps it | Pass |
| Print: an attestation banner prints on the workflow as written and is dropped from a changed version; the in-review banner always prints | Pass, by setting the page's state in the browser. No page is attested yet |
| The handoff line (A20): five as written; four when the role that asks also makes the call; hidden when a step has no owner; back on reset | Pass |
| The board (A20): as written it shows seven rows; changing who leads redraws it and its counts; a job left unfilled marks that step's column; "Back to the workflow as written" restores it; it is left out of print; on a phone it scrolls inside its frame with the row labels pinned | Pass. On a 1280 by 900 screen the nine menus and the whole board together are about 1,220 px tall, so the lower half of the board needs a scroll |
| 390 px and 320 px wide: no sideways scrolling; menus and buttons at least 44 px tall | Pass |
| Script switched off: all nine menus and both buttons are off, a note says why, and the sheet is the workflow as written | Pass |
| A screen reader announces the status line after a choice; the menus are usable with VoiceOver on a phone | **Needs a person.** The status line is a live region; nobody has listened to it |

### A22 in a browser (2026-11-17, Chromium, by hand)

| Checked | Result |
|---|---|
| A button for each role comes alive with the script; pressing one asks for the print dialog once, and in print that card stands in for the sheet, with the in-review banner | Pass |
| The card for social work, as written, holds steps 2, 3, 6 and 8, the guardrails, the exceptions and the closing line, and none of the other steps | Pass |
| Each of the seven cards as written prints on one Letter page. The fullest card the page can make (one role named at all eight steps) prints on two, Letter and A4 | Pass |
| When the browser reports the print done, or the dialog is closed, the sheet prints again; so does "Print your version" pressed straight after a card | Pass |
| A choice redraws the cards and their buttons; a changed version's card carries its version code and the line that it is a local adaptation | Pass |
| A job left unfilled: no cards, every card button off, and a switched-off button does nothing | Pass |
| Keyboard: Tab reaches each button, Enter presses it; the group is named by its heading | Pass |
| 390 px wide: the buttons wrap, each at least 44 px tall, no sideways scrolling. Script off: seven buttons, all off | Pass |
| A card printed on paper from a real printer; the buttons with a screen reader | **Needs a person** |

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

### A21 against the real procedure (2026-11-17, by hand)

The procedure names the unit, so it is kept outside the repository and this check is run at a terminal: `node tools/compare_workflow_source.mjs <procedure.txt> <substitutions.json>`. It exits 0 when every sentence that is not the procedure's has a recorded reason and the procedure's leftover text is what it was at the last comparison.

| Checked | Result |
|---|---|
| The procedure as read from the author's document store on 2026-11-17, with the six recorded substitutions | 86 sentences; 72 word for word and in place; 14 differ, each with a reason; exit 0 |
| What the procedure says and the workflow does not carry, read against `docs/WORKFLOW_INTAKE.md` | Every piece is a recorded removal, a heading, or a phrase the author's instructions replaced |
| The same comparison when the procedure next changes | **Needs a person** to save the new text and run it. The record's fingerprints then say which sentences moved |

### A24 in a browser (2026-11-18, Chromium, by hand)

| Checked | Result |
|---|---|
| Every built page's HTML, before and after the pass | Byte-identical; only `assets/site.css` differs. No page's attestation hash moves (22 of 22 compared) |
| Horizontal overflow on all 27 pages at 1280, 390 and 320 px | None |
| A shadow, a gradient or an all-caps label left on a door, directory entry, "Try saying", status banner or strip, or studio scene, on any page | None |
| The widest prose paragraph at 1280 px | Under 78 characters on every page |
| The empty turn | Drawn at "The room goes quiet" (`exchange`); absent at the next position (`choices`); still drawn in dark mode; does not move with reduced motion |
| Print: page counts before and after for the workflow, the adaptation sheet, the observer card, a move card, the pocket card, the rehearsal, the home page and the map | Identical (2, 2, 1, 1, 2, 2, 4, 6) |
| The map's lines | Two segments as written (steps 6 to 8); none while "Test yourself" hides the marks |
| The suite against a copy with the 18 pages that need no release record attested (rule 12) | 128 of 128 pass; the commit before the pass, signed the same way, 123 of 123 |
| A screen reader on the script layout; a real phone; the "In review" note as a faculty reviewer sees it | **Needs a person.** The DOM order is unchanged, so the reading order should be too |

### A25 in a browser (2026-11-18, Chromium, by hand)

| Checked | Result |
|---|---|
| Every position of the rehearsal, reached by pressing its choices (25) and the pause tool (2), plus the supervisor's hand-back and the end | All 27 positions and both screens seat exactly the people the rule gives. An absent family seat is drawn dashed |
| What assistive technology is told, at the pause's debrief | The list "Who’s in the room?" with two items: Resident, Supervisor |
| With the script off | The room is not shown |
| The observer strip | "Make a plan": Sal 3, Resident 2, Rowan 2 steps. "Invite a correction": Sal 3, Resident 4, Rowan 4, Sal 4, Rowan 5 |
| Overflow at 390 and 320 px on both pages | None |
| Dark mode; reduced motion | Legible; the seats change without transition |
| Print page counts before and after (the rehearsal, the observer card) | Identical (2, 1) |
| The suite against a copy with 18 pages attested (rule 12) | 133 of 133 |
| Whether the room helps a resident see that a disclosure is private, and whether the strip prompts the observation the card asks for | **Needs a person** |

### A26 and A27 by hand (2026-11-18)

| Checked | Result |
|---|---|
| “Fresh scenes, one turn each” in Chromium at 1280, 390 and 320 px | No sideways scrolling. The widest line of prose is 68 characters |
| The six comparisons | All closed as loaded, and no model line is rendered until one is opened. A press opens one; with the keyboard, Tab reaches each move link and each comparison in order, Enter opens and Space closes. Each is 50 px tall |
| With the script switched off | A comparison still opens: it is a `<details>` element |
| Requests and storage | The page, the two stylesheets and the site script; nothing in localStorage, sessionStorage or cookies |
| The empty turn | A 2 px rule in the voice colour above the instruction; in dark mode it and the lines stay legible |
| Print | Comparisons closed: a worksheet of three Letter pages, each scene ending on a ruled line, no model line printed. All six opened first: four pages, with the model lines |
| Print page counts of the pages that were already there, Letter and A4 | The workflow, the adaptation sheet, the observer card, a move card, the pocket card, the rehearsal and the map are unchanged (2, 2, 1, 1, 2, 2, 6). The home page lists one more page and now takes five Letter pages (four before; still four on A4) |
| The suite against copies of the repository in five attested states (rule 12): the new page alone; the 19 pages with no release gate; every page, with release records; the new page with upstream attestations honoured; the cards and the scenes without the rehearsal | 159 of 159 in each |
| Twenty-six deliberate breaks of the new code, one at a time in a scratch copy: a rule switched off, a comparison open as built, a temperature in the request, a key left in an error, the tool allowed on a build server, and so on | Each fails at least one test |
| The drafting tool, as a dry run, for both kinds of brief | Prints the request and sends nothing |
| **The drafting tool against the API** | **Not run.** The session that built it had no key. The six scenes were drafted by Claude in that session and held to the rules by the build |
| A screen reader on the comparisons; a real phone; the worksheet on paper | **Needs a person.** The comparison is the browser's own disclosure element, so it should announce as collapsed and expanded |
| Whether a fresh scene shows that a skill carried over, and whether any model line is one the author would say | **Needs people**: a resident and a supervisor, and the author |

## What no test here establishes

- That any sentence is clinically right. That is the attestation.
- That a line the voice rules pass is a good line, or the author's. The rules hold a line to a form (A26); the rehearsal's four missteps pass them. Whether a model line is right, kind and his is the review, and whether its wording adds pressure is the lived-experience read.
- That the drafting tool works against the API as it is today. No request has been sent from this repository's tests or from the session that built it. The request's shape was read from the API reference on 2026-11-18; the first run at the owner's terminal is the check.
- That a finding from an outside reviewer is correct. The check in A23 says only that the finding quotes words the site has (`docs/OUTSIDE_REVIEW.md`).
- That the rehearsal's wording does not add pressure. That is the lived-experience review.
- That the privacy and disclosure page is right for a given hospital. That is a privacy or legal reader.
- That the pages work with a screen reader, on a phone, or printed. Those are short human checks.
- That the copy of the procedure the script read is the procedure in force on the unit. It was the document in the author's store on 2026-11-17. The two other pages built from his materials (setting it up; time, format and stance) were copied and re-read, not compared by script (`docs/WORKFLOW_INTAKE.md`).
- That the map teaches. It is a faithful copy of the workflow, drawn as a board; whether a resident learns the workflow faster from it, or from covering it and recalling, has not been tried with a resident.
- That the roles offered for each job are ones that may hold it on a given unit, or that an adapted version is safe to work from. The tests check that every version reads as prose and that no step is left without an owner. A changed version says on its face that nobody has reviewed it.
- That publishing the unit workflow is permitted, or wise. The hashed list keeps names off the page; it cannot tell whether a reader could work out which unit this is. That is the release confirmation.
