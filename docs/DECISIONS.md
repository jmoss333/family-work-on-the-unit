# Decisions

Two parts: the architecture decision that shaped this build, and the decisions that are the owner's and are still open. Each open decision has a default that is already in effect, so nothing is blocked while it waits.

## ADR-001 · A separate repository that imports from the Clerkship Library by pin (2026-11-15)

**Context.** The owner wants a family-work site "similar to the psychiatry clerkship library" for residents and attending physicians, on GitHub and Netlify. The Clerkship Library already holds reviewed family-work pages, and its rule is that content never forks.

**Options.**

| Option | For | Against |
|---|---|---|
| A. A third site built from the Clerkship Library repository | Content cannot fork; inherits the ledger, the evidence registry and CI | 2,937 files and a build made for two learner sites; couples releases; the audience, name and licence decisions differ; hard to share with another program |
| B. A separate repository that copies and rewrites what it needs | Small and independent | Rewriting attested text creates new review work and two versions to keep true |
| **C. A separate repository that copies byte for byte and pins** | Small and independent; a copied page keeps the attestation it earned, proven by hash; an upstream change is visible as a failed pin, not as silent drift | A pinned copy must be re-pinned to pick up upstream edits |

**Decision.** C. Imports live under `content/upstream/`, are never edited, and are pinned in `governance/sources.lock.json` to a commit and a blob. Where the upstream ledger attested the file, the build re-derives that ledger's hash from the bytes shipped here.

**Consequences.** New review work is limited to text that is actually new. The Clerkship Library stays the home of the pages it already owns; this site is the home of the move cards, the rehearsal and the resident and attending material. If the two ever need to diverge on an imported page, that page stops being an import: it becomes a page of this site with its own review.

## ADR-002 · A public repository, a de-identified unit workflow, and a second gate (2026-11-16)

**Context.** The owner chose to make the site public for now, and asked for the unit's own workflow to be included, de-identified: the process of establishing a system that promotes family work. A public repository shows every file to everyone, including the list of names a de-identified page must not contain.

**Options.**

| Option | For | Against |
|---|---|---|
| A. Keep the list of protected names in `site.config.json`, in clear text | Simple; it was already there | In a public repository the list itself names the unit and its institution |
| B. Keep the list outside the repository | Names are nowhere in public | The check cannot run on Netlify or on anyone else's machine; a check that runs in one place gets skipped |
| **C. Keep the list in the repository as hashes** | The check runs everywhere, in the tests and inside the build; no file spells the names out | A hash of a short name can be confirmed by someone who already suspects it. This hides the names from a reader, not from a guesser |

**Decision.** C, with two additions. First, the build itself refuses to write any page while one page prints a protected name, and a failure names the file and line and never the term, because a public repository has public logs. Second, a page that describes how a real unit works carries a release gate: the attest command asks the reviewer to confirm, by name and separately from the clinical review, that the page identifies no one and nothing, reports no internal figure, and may be published. A reviewed row without that record fails the build.

**Consequences.** "De-identified" on this site means not named, no patient or staff detail, no figure from the unit. It does not mean anonymous: the author is named, and an author's employer is a search away (`docs/WORKFLOW_INTAKE.md` says this to the reviewer in full). Whether to publish on those terms is the owner's decision, recorded when the two pages are attested.

## ADR-003 · An adaptation page with fixed choices, and a review that covers its script (2026-11-17)

**Context.** The owner asked for the page proposed the day before: a reader names who does each job on their own unit and how often, the workflow is rewritten in the browser with nothing stored, and it prints as that unit's version. A step with no owner is still refused. If every unit that adopts the workflow describes itself in the same structure, units can be compared.

**Options.**

| Option | For | Against |
|---|---|---|
| A. Let the reader type each role's title | Any title a unit uses | A text field is where a colleague's name gets typed, on a site whose rule is no free-text capture. Typed words cannot be fitted into a sentence ("the charge nurse's calendar") or checked, so no printed version could be said to have been tested |
| B. Fixed lists, plus a link that carries the choices | A unit could send its version to a colleague | A link that restores choices is stored state under another name, and the brief says a refresh starts over. It needs the address bar, which the site's scripts are forbidden to write |
| **C. Fixed lists, and a version code printed on the sheet** | Nothing can be typed. Every sentence the page can print is known in advance, and every combination is tested. The code records a unit's choices in one structure | A unit whose title is not on a list picks the nearest one, or asks for the title to be added, which is a reviewed change |

**Decision.** C, with four parts.

1. **Rules anchored in the workflow's own words.** Each rule in `workflows/unit-family-meeting.adapt.json` names a field, the exact words it replaces and what replaces them. The build refuses a rule whose words are not in that field exactly once, or whose replacement, with nothing changed, is not those same words. So the workflow as written is reproduced word for word, and an edit to the workflow that a rule no longer fits stops the build.
2. **Six jobs, two intervals and one question.** The procedure has one person lead rounds, the meeting and the note. The page asks who leads rounds separately from who leads the meeting, because on other units those differ. The question, added on 2026-11-17, is whether an ambient documentation tool drafts the note; "No" prints a sentence the author approved in place of the one about the tool. A job can be left as "No one yet"; the step is then marked and the version does not print.
3. **The review covers the script.** What a reader sees is computed, so the page's hash covers three files: the rules, the workflow and `src/assets/adapt.js`. Changing any of them reopens the page. A rehearsal is different: all of its text is in the case file, and its script only moves between positions.
4. **An attestation is of the workflow as written.** A changed version prints a line saying it is a local adaptation that neither the workflow's author nor the reader's institution has reviewed, and in print the attestation banner is dropped from it.

**Consequences.** The reviewer attests a set of rules, not each of the 1,270,080 sheets those rules can print; the tests are what stand between the two (`docs/ACCEPTANCE.md`, A18). The page is under the release gate, because it prints the unit's procedure. The script can read a version code back into choices, and no page uses that yet. Adding a title or an interval is a content change, and D15 to D18 below are the judgments in the current lists.

## ADR-004 · A map drawn only from text other pages carry, and tests that survive an attestation (2026-11-17)

**Context.** The owner asked for an interactive, integrated visual of the workflow and the rest of the site, to make it quicker to understand and to learn from. A new teaching page is new text in the review queue, and the reviewer's time is the constraint.

**Options.**

| Option | For | Against |
|---|---|---|
| A. A drawn diagram with its own captions | Free in form | Every caption is a new sentence to review, and a drawing drifts from the workflow the day the workflow changes |
| B. A richer workflow page (filters and views on the page that already exists) | No new page | It cannot hold the meeting, the move cards and the rest of the site, which is the integration that was asked for |
| **C. A page the build draws from files other pages already use** | The board, the step cards, the formats, the parts and the page titles are copies, made by the build, so they cannot drift. About 100 words are new | It needs a new kind of page, and it reads one table out of another page's Markdown |

**Decision.** C, "How it fits together", with five parts.

1. **A board from the workflow file.** One column for each step, one row for each role. A role is marked at a step exactly when that step's own words name it: as owner when the owner label names it, otherwise as also involved. A test checks every mark against the words, in both directions. To make that true the workflow file's roles were corrected: it had lumped "Psychiatrist" into "Psychiatrist, APP or resident", where the procedure gives the first step to all three and the meeting, the note and the bridge to the psychiatrist. The build now also checks the file's owners against the adaptation rules.
2. **The parts of a meeting come from the page that states them.** The build reads the table under "The five parts of a meeting" and refuses a table that has moved, changed shape or dropped a move card. The map prints the part names and takes each card's title from the list of pages.
3. **A page that does not ship is not named.** In the map's own lists a move card that is still in review appears as "Move 3 (in review)" and a leftover page does not appear.
4. **The script composes nothing.** It shows, hides and marks what the build wrote, and a test denies it every way of writing text. So the map's review covers three files (its own, the workflow, the page the parts come from) and not the script. The adaptation page is the opposite case (ADR-003).
5. **Self-testing.** One button covers every answer on the board; pressing a step uncovers its column. No score is kept and nothing is stored.

**What this turned up.** Simulating the map as the only attested page showed that the test suite assumed nothing was attested. Run against copies of the repository with pages attested, eleven tests failed. Eight started from a copy of the real ledger and took it to hold no attestation. Three asserted of the real build that a page was pending or had not shipped; one of those forbade any public page from naming a page in review, which an attested page does whenever it links to one. The deploy runs the tests before it builds, in every context, so the first attestation would have failed both sites. Now a test's scratch copy starts from a ledger with nothing attested and the owner's switches at their defaults; the naming rule covers the pages the build writes itself, and a new test holds an attested page to naming a page in review only as plain words marked "(in review)". The suite was then run against copies in seven states and passed in each (`docs/ACCEPTANCE.md`).

**Consequences.** The map is under the release gate, because it prints the unit's procedure. Editing the workflow, the map file or "Two kinds of conversation, one spine" reopens it. The home page has a third door and the navigation a seventh entry (D19).

## ADR-005 · A design pass that changes how pages look and nothing they say (2026-11-18)

**Context.** A design review against the frontend-design guidance found that most of what made the site look generic came from the design system's components: one card with one shadow on everything, gradient fills, all-caps labels above every title. The most useful line on a move card ("Try saying") carried the same weight as its review banner. The palette and the type stack are pinned (A12), and the reviewer's time is the constraint, so a pass that changed wording would cost review minutes.

**Options.**

| Option | For | Against |
|---|---|---|
| A. Fix the components in the design system | One fix for this site and the Clerkship Library | Not this repository's to change (AGENTS rule 6), and slower |
| B. Rewrite the home page and the move cards | The strongest result | Every changed sentence reopens a page |
| **C. One section of `site.css`, screen only, that changes no words** | Reopens nothing: no page's hash moves, every built page's HTML is byte-identical, and one revert undoes it | Bound by what the markup already gives it |

**Decision.** C. The organising idea is "the margin says who; the column says what".

1. **A script.** In the rehearsal and in "Try saying", the speaker's name hangs in a margin column in terracotta beside their line, which is set in Georgia.
2. **The empty turn.** Where a position's closing line asks the resident to speak, the margin is left blank and a rule waits in the column above the instruction. It is drawn, not typed into. A test holds the list of positions to the case file: a position that is not a debrief, whose closing line says "aloud", "say" or "repair the moment". The rule draws in once; with reduced motion it does not move.
3. **Provenance in the margin.** The status banner keeps its words and its colour, and loses its card: it becomes a note with a rule on its left.
4. **Lines on the board.** On the map and the adaptation board, a line joins the steps one role owns in a row, so a break is a handoff. It draws only what the marks already say and is not a flag (D23, rule 15). On every thirteenth version, the breaks equal the handoff sentence. In the map's self-test the lines are hidden with the marks.
5. **The card kit retires** on the home doors, the directory, "Try saying", the status banner and strip, the studio scene, the move navigation and the guide index. The workflow, the formats, the evidence records and the map's parts keep their cards, because they are sheets that print.
6. **The home directory is a contents page**, with each section's name in the margin. Labels are in sentence case. Page titles are 36 px.

**Consequences.** Terracotta now marks a voice on these pages (D24). `studio.js` is a source of the rehearsal page, so the empty turn is keyed in CSS on the position, not on a class the script adds. Print is untouched: the section is inside `@media screen`, and the printed page counts of the workflow, the adaptation sheet, the observer card, a move card, the pocket card, the rehearsal, the home page and the map are the same as before (A24).

## ADR-006 · Who's in the room, and the turn strip: two pictures drawn from the case (2026-11-18)

**Context.** After the design pass (ADR-005), the owner asked how the design could go further. The proposal was to let the pictures teach what the six moves teach: whose room it is, and whose floor. Neither page is attested yet. Both pictures touch a review source (`src/lib/studio.mjs` and `src/assets/studio.js` for the rehearsal, `src/lib/observer.mjs` for the observer page), so they cost no attestation now and would reopen a page later.

**Decision.**

1. **Who's in the room.** The rehearsal shows four seats under the title: one for each person in the case, one for the learner, and the supervisor's, outside the room. The case's own flags decide who is present. In a position marked joint, both people and the learner are present. In any other position, the patient (the case's first person) and the learner are. In a debrief, at the supervisor's hand-back and at the end, the learner and the supervisor are. An absent seat is drawn empty and hidden from assistive technology, so the picture and the spoken list are the same list. The rule travels in the page's data block; `studio.js` applies it and composes no text. Without the script, and on paper, the room is not shown.
2. **The turn strip.** On the observer page, each turn button carries whose turn it is and how long it runs: one step for every three words, up to eight. The patient's mark is solid terracotta, the support person's an outline, the resident's ink. In "Make a plan" Rowan speaks once, briefly and last ("That’s not quite it."). In "Invite a correction" Rowan speaks twice, with the longest turn in the exchange, and Sal answers Rowan rather than for Rowan.

**Words.** No sentence is added. The room's list is labelled with the aside's own heading, "Who’s in the room?". The seats carry the case's names, the case's learner role and "Supervisor".

**What the case had to agree to.** Before drawing it, every position was checked: Sal speaks in no position the case marks as private, and no family member speaks in a debrief. A test keeps it so (A25).

**Consequences.** The rehearsal and the observer page change hash; both were pending. To change a seat, edit `roomRule` in `src/lib/studio.mjs`, which is a source of the rehearsal page. To change how a turn's length is measured, edit `turnLength` in `src/lib/observer.mjs`, a source of the observer page (D27, D28).

## Open decisions

| # | Decision | Default in effect | Why it is yours | To change it |
|---|---|---|---|---|
| D1 | **Name, audience line and section list.** "Family Work on the Unit", for residents and attending physicians, ten sections | As built | It is your site's identity | `site.config.json` |
| D2 | **Two kinds of conversation.** The site says the playbook describes a team-led family meeting and the six cards describe a brief, patient-directed conversation, with the playbook's five phases as the shared spine. Since 2026-11-16 the page also maps the five parts from your November teaching to the cards; they fit the cards more closely than the playbook's phases do | Stated on "Two kinds of conversation, one spine", in review, with both mappings | It is a teaching claim about your own material. Which sequence is the spine is yours to say | Edit or drop `content/pages/start-one-spine.md` |
| D3 | **Honour upstream attestations.** Let the two byte-identical imports ship publicly on the strength of your 2026-09-26 Clerkship Library review | Off. They show as "Attested upstream" and stay out of the public build | That review was for a student audience; only you can say it covers this one | `"acceptUpstreamAttestation": true` |
| D4 | **Licences.** MIT for software, CC BY-NC-SA 4.0 for teaching content, as in the Clerkship Library | Proposed. The repository is public and both licence files open with a PROPOSED paragraph: until you confirm, everything of yours here is all rights reserved, and the footer says so | You are the rights holder, and a licence once granted cannot be taken back from those who already have a copy. The imports are already CC BY-NC-SA 4.0 | Set `"licenceConfirmed": true`, delete the PROPOSED paragraph from `LICENSE` and from `LICENSE-content`, and set `"license": "MIT"` in `package.json`. A test fails if the four disagree |
| D5 | **Crisis contacts.** The imported playbook carries the Clerkship Library's `<!-- crisis-block -->` marker. That library fills it from a verified contact list last checked 2026-07-27 | Not filled. The marker is preserved and invisible | A clinician-facing site may not need the block; if it carries one, the contacts need a current check | Import `crisis_resources.json` by pin and render it where the marker sits |
| D7 | **Other reviewers.** The brief asks for lived-experience reviewers for the rehearsal and a permissions route; the boundaries page needs a privacy or legal reader | Unnamed. Those three pages are risk "high" and sit at the top of the queue | An attestation of the rehearsal without a patient or support-person advisor would skip the brief's own test | Name them; record their review in the commit that attests |
| D8 | **One home per asset.** Six family-work surfaces now exist: the Clerkship Library's family section and two tools, the seminar companion, the didactic exercise, the relational-systems hub, and this site | This site links only to the Clerkship Library | Which surfaces point here, which stay, and which retire is a portfolio call | Add to `relatedSurfaces` in `site.config.json` |
| D9 | **The pocket card.** Imported from an unshipped Clerkship Library source file; its text refers to a companion printable that is not here, and it was never attested. Your November teaching has a newer pocket card, which is not on this site | The older card, in review, risk high | It is your framework. It can stay an import, or the November card can replace it as a native page | Replace the import with a page under `content/pages/` |
| D10 | **A card for the handoff.** The evidence register says the effective dose of family work is a course after discharge; no card covers handing the family on to it | Not written | It needs your local referral routes | Add card 7 |
| D11 | **Publishing the unit workflow.** Two pages describe how a real unit works. They name nothing and report no figure, and they are not anonymous, because the site carries your name | In review. Neither page can be attested without the release record (ADR-002) | Whether your institution's rules allow it, and whether you want it, are yours to answer | `npm run attest -- system/unit-workflow`, which asks |
| D12 | **Product names.** The procedure names the documentation and health-record products in use. The pages say "an ambient documentation tool", "an AI tool" and "the drafting tools" | Generic wording; the product names are on the protected list | Naming a vendor on a public page is an endorsement question and an identification question | Reword the page, and remove the name's hash from `governance/protected-terms.json` |
| D13 | **How the workflow was introduced.** The pages give the workflow and the constraints it answers. No source says in what order the steps were adopted, which was hardest to hand over, or what the first month looked like | Not written | Only you know it | Add a section to `content/pages/system-set-it-up.md` |
| D14 | **Search engines.** The site is public and asks not to be indexed: a header, a meta tag and `robots.txt` | Not indexed | Public and findable are different decisions | `"indexable": true` in `site.config.json` and delete the `X-Robots-Tag` line in `netlify.toml`. A test fails if the two disagree |
| D15 | **Who may hold each job.** The adaptation page offers, for each job, a list of roles: for example a psychologist or social work may lead the meeting and sign the note, and a peer specialist may bring the family up | Claude's lists, in review | Which role may hold which job is a clinical and scope-of-practice judgment, and a list on your site reads as your view | Edit `slots[].options` in `workflows/unit-family-meeting.adapt.json` |
| D16 | **What a unit may change.** Six owners, two intervals, and whether a tool drafts the note. Everything else is fixed: the private check, the formats and their gates, the reasons for no joint meeting, the guardrails, the measures, and four intervals (no major decisions in the first 72 hours, revisiting a declined involvement at 72 h, repairing the alliance within 24 h, and booking within 24 h of known availability) | As built | Where logistics end and clinical rule begins is yours to say | Add or remove a rule or an interval in the same file |
| D17 | **The intervals on offer.** First contact within 24, 48 or 72 h; updates every 48 h, 72 h or week. Only 24 and 72 are the procedure's own | As built | "Every week" may be too slack for an acute unit, and you may prefer to offer the procedure's numbers alone | Edit `timings[].options`; a test records every interval that is not the procedure's |
| D18 | **Rounds has its own owner.** The procedure has the psychiatrist lead rounds and the meeting. The page asks the two separately | Separate | You may hold that the person who leads the meeting must be the one who sets the format at rounds | Remove the `rounds` job and point its rule at `lead` |
| D19 | **The map as a way in.** The home page has a third door, "See how it fits together", and the navigation a "Map" entry after Home | Both on | The front of the site is yours (D1) | Delete the third entry under `doors` in `site.config.json`; the navigation entry follows the page |
| D20 | **Who counts as "also involved".** The board marks a role at a step when the step's words name it. So whoever leads the meeting is marked at booking (the meeting goes on the lead's calendar) and when the family is brought up (the lead is told), the psychiatrist only at rounds, and nursing only where it is notified or may join | As the words have it | A reader will take the board as your account of who does what, and nursing owns no step on it | Change the step's wording in the workflow file; the marks follow the words, and a test fails if they do not |
| D22 | **What a role card carries.** One printed card for each role: the steps it owns and the steps that also involve it, the guardrails, the exceptions, the line on where the workflow comes from and the closing line. It leaves out the other roles' steps, the three formats and the measures | As built | A card is read on its own, away from the sheet. Whether the guardrails belong on every card, and whether a lead's card needs the formats, is yours to say | The `cards` function in `src/assets/adapt.js`; a test holds every sentence on a card to the sheet |
| D23 | **What counts as a handoff.** Under the board the adaptation page says how often the work changes hands in the reader's version, and after which steps. It counts a handoff where no one who owns a step also owns the next; so a step two roles share takes no handoff from either, and the team owning rounds always makes two. As written the count is five | As built | The workflow's own principle is that each step removes a handoff, and this puts a number on a unit's version. Whether that is the right way to count is yours to say | The `handoffs` function in `src/assets/adapt.js` and the sentence `board.handoffs` in the rules file |
| D24 | **Terracotta means a voice.** Since the design pass, speaker names, "Try saying" and the empty turn are terracotta, and door titles are teal. The navigation underline, the map's step numbers and the board's marks are still terracotta | As built | It is the site's look, and its sister site shares the palette | The section "The margin" at the end of `src/assets/site.css` |
| D25 | **Where the component fixes live.** The design pass overrides the design system's eyebrow and card styles in this site's `site.css`. The same fixes could go upstream, so the Clerkship Library inherits them | Here, in `site.css` | The design system is yours, and so is the Clerkship Library | Move the rules to the design system and delete them here |
| D26 | **Which positions get the empty turn.** Those whose closing line asks the resident to speak: twelve of the case's 27, by the rule in ADR-005 | As built | It is a reading of your rehearsal: where the turn passes to the resident | The list in `site.css`; the test says which positions the rule would add or remove |
| D27 | **Who the room seats.** A private position seats the patient and the learner; a debrief seats the learner and the supervisor; the supervisor watches the fiction from outside the room. The rule follows the case's `joint` and `debrief` flags | As built | It is a reading of your rehearsal and of the supervisor's place in it | `roomRule` in `src/lib/studio.mjs`; a test fails if the room ever shows a speaker away |
| D28 | **What the turn strip measures.** A turn's mark grows by one step for every three words, up to eight; no caption says so | As built, uncaptioned | Words are a proxy for holding the floor, not a measure of it. A caption would be new text to review | `turnLength` in `src/lib/observer.mjs` |

## Decided

| Date | Decision |
|---|---|
| 2026-11-15 | No AI system attests. `tools/attest.mjs` refuses to run without a terminal. |
| 2026-11-15 | The public channel ships attested text only; the filter is in the build. |
| 2026-11-15 | Effect sizes stay off the move cards and live in the evidence register with their setting and dose. |
| 2026-11-15 | No stored state, so no dark-mode toggle: the site follows the reader's OS setting. |
| 2026-11-15 | The design system's palette is used unchanged. Where a pairing fails AA, the site uses a different token from the same system rather than a new colour. |
| 2026-11-16 | **D6, who can see it: public for now.** The owner's decision. The repository is public and the Netlify project has no visitor restriction. It can be changed later (`docs/DEPLOY.md`); what was public in the meantime may have been copied. |
| 2026-11-16 | The list of protected names is kept as hashes, and the build refuses to write a page that prints one (ADR-002). |
| 2026-11-16 | A page about a real unit needs a recorded release confirmation as well as a clinical attestation (ADR-002). |
| 2026-11-16 | The site carries a tenth section, "Build the system": the unit workflow and how to set it up. |
| 2026-11-17 | The adaptation page offers fixed lists only: nothing can be typed, nothing is stored, and there is no link that carries a version (ADR-003). |
| 2026-11-17 | The adaptation page's review covers its rules, the workflow and its script (ADR-003). |
| 2026-11-17 | A script ships only with a page that loads it, so the public build with nothing attested carries the site script and no other. |
| 2026-11-17 | The map is drawn by the build from files other pages already use, and its script composes no text (ADR-004). |
| 2026-11-17 | The workflow file names its roles as the procedure's owner labels do. "Psychiatrist" is a role of its own, and the build checks the file's owners against the adaptation rules (ADR-004). |
| 2026-11-17 | An APP or a resident may lead the meeting, sign the note and work the discharge bridge; an APP does so independently. The owner labels of steps 6 to 8 now read "Psychiatrist / APP / resident" (the owner's answer; `docs/WORKFLOW_INTAKE.md` records the change). |
| 2026-11-17 | The adaptation page draws the board, redrawn as the reader chooses, with a count of the steps each role owns and a mark on any step nobody owns. As written it is the map's board. It is not printed. |
| 2026-11-17 | A version code carries three characters worked out from the lists it indexes (`2.0-4bc/A0C0S0R0E0L0/T0U1/D0` is the workflow as written), so a code made before a list changed is never read against the lists after. |
| 2026-11-17 | A review from outside the site is asked for with one file and one prompt, and what comes back is checked before it is read: `docs/OUTSIDE_REVIEW.md`. An outside reviewer, human or model, attests nothing. |
| 2026-11-17 | The board says how often the work changes hands (the owner agreed to the proposal; D23 asks how to count). A flag for a handoff in which the next owner is not told was proposed with it, tested against every version, and not built. Read strictly (the step before must name the next owner) it marks four of the five handoffs in the workflow as written, because the procedure passes work through what is written and not by naming who is next. Read to allow for that (named, or something written at the step) it marks nothing in any of the 25,200 versions that print. |
| 2026-11-17 | The adaptation page prints a card for one role, cut from the reader's version. Every sentence on a card is one the sheet prints; the page adds one heading, "Print a card for one role". A version with a step nobody owns has no cards (the owner asked for them; D22 asks what they carry). |
| 2026-11-17 | The unit workflow is compared with its procedure by script, and the result is kept as fingerprints in `governance/workflow-source-check.json`. A sentence that changes afterwards fails the tests until it is compared again or listed with its reason. The procedure stays outside the repository. |
| 2026-11-17 | The calendar and the word that the family has arrived go to whoever leads the meeting. Steps 3 and 5 say "the meeting lead" in every version (the owner's answer; was D21). |
| 2026-11-17 | A resident leads and signs under the attending psychiatrist's supervision, and the attending co-signs the note. The line is under step 7, marked as added, and prints only on versions in which a resident can lead (the owner's answer). |
| 2026-11-17 | A unit with no ambient documentation tool can say so: a ninth menu, whose "No" prints "Write the note after the meeting; sign." The guardrail on AI drafts stays in every version (the owner's answer). |
| 2026-11-17 | A test's scratch copy starts from a ledger with nothing attested. An attested page may name a page still in review, as plain words marked "(in review)"; the pages the build writes itself may not (ADR-004). |
