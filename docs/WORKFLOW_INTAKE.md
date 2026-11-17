# The unit workflow: where each sentence came from

Written 2026-11-16 for the faculty reviewer. It covers the three pages built that day from the author's own materials:

| Page | Built from |
|---|---|
| The unit workflow (`workflows/unit-family-meeting.workflow.json`) | The author's one-page unit procedure for family meetings, version 2.0, November 2026 |
| Set it up on your unit (`content/pages/system-set-it-up.md`) | Two slides and their speaker notes from the author's November 2026 resident teaching; the author's July 2026 handbook for attending psychiatrists |
| Time, format and stance (`content/pages/formats-time-format-stance.md`) | The author's November 2026 one-page resident reference; one slide and its notes from the same teaching |

None of the source documents is in this repository. They name the unit, its institution and the products it uses.

## How the text was carried over

The source documents were read as text from the author's document store on 2026-11-16 and copied by an AI assistant (Claude). Every field was then re-read against the source, clause by clause.

That is weaker than the check the move cards had. The cards were lifted by a script and compared by a script. Here there was no file to run a script on, so the comparison was a reading. If the procedure is saved as text beside the other intake files, the same byte-level comparison can be run.

## What was changed in the workflow

The procedure's wording is kept. These are all the departures.

| Change | In the procedure | On the page |
|---|---|---|
| Removed | The title line naming the unit; the line naming the institution, the owner, the version and the review date | The page title; "Workflow version 2.0"; a one-sentence statement of where it comes from |
| Removed | The closing list of sources: slide numbers and sections of an internal manual | Nothing |
| Replaced | The name of the ambient documentation product (step 7) | "An ambient documentation tool" |
| Replaced | The names of two AI products (guardrail 3) | "an AI tool" |
| Replaced | The name of the health-record product (step 7, where it is written) | "discharge-summary draft" |
| Expanded | "SW" (steps 3 and 6, and the first exception) | "social work" |
| Expanded | "5-min phone update", "30-min structured", "60–90-min alliance repair (optional)" as the names of the formats | "5-minute phone update", "30-minute structured meeting", "60–90-minute alliance repair (optional)". Step 3 keeps the short forms |
| Rendered | A dash under "Where it is written" (steps 5 and 6) | A dash, read to a screen reader as "Nothing is written at this step" |
| Restructured | One table, and four blocks of running text | Eight step cards, three format cards, two lists and a table |
| Changed on the author's instruction, 2026-11-17 | "Psychiatrist" as the owner of steps 6, 7 and 8 (the meeting, the note, the discharge bridge) | "Psychiatrist / APP / resident", the form step 1 already uses. The author said that an APP or a resident may lead the meeting and sign the note. Steps 3, 4 and 5 still name the psychiatrist, as the procedure does: whose calendar the meeting goes on, who leads rounds, and who is told the family has arrived |

## What was added

Each addition is listed in the workflow file under `additions`, and the page marks it "Added in adaptation" while it is in review.

| Added | Why | Basis |
|---|---|---|
| "The sleep figure is a local pacing convention, not an evidence-derived threshold: the number is there so the team makes the same call twice." | The gate "sleep is restored (5–6 h)" reads as a clinical threshold | The July handbook says this of a similar sleep rule with different cut points. Applying it to the November figure is the assistant's step, not the author's |
| "These measures are proposed. This page reports no results." | So that a reader does not take the workflow as evaluated | The procedure calls the measures "proposed" |
| "Checks: Step N" beside each measure | Ties each measure to the step whose completion it counts | The assistant's reading of the "Done when" column |
| "See also" links under six steps | Connects the workflow to the cards and pages of this site | None needed |

## What was left out, on purpose

- **One figure about the unit** that appears on a teaching slide. It is not measured: the procedure says to set a baseline before setting targets. A page about a real unit carries no figure from that unit.
- **An account of how the workflow was introduced.** In what order the steps were adopted, and against what resistance, is not in any source. It is the author's to write (`docs/DECISIONS.md`, D13).

## How the other two pages were assembled

**Set it up on your unit.** The table of six constraints is the slide's, row for row. One row is a composite: the slide names three products; the page says "the drafting tools" and takes the rest of the sentence from the speaker notes. The list under "Settle these locally first" is from the July handbook: its two items "deliberately left to your unit", its "reality constraints", and its rule that the record is a narrative note with no new fields. The handbook states the interpreter lead time as a fact; the page gives it as this unit's figure, because it will differ elsewhere. "What this does not claim" is restricted to what the evidence register supports. The resident reference's broader sentence, that no study shows one inpatient meeting shortens a stay, was not used, and neither were its two citations that are not in the register (Chien 2024; Butzlaff and Hooley 1998). Neither has been checked.

**Time, format and stance.** The three formats, the gates, the decision rule, the list of reasons for no joint meeting, the five parts and the four PACE lines are the resident reference's. "Format and purpose are separate decisions" and the three sentences after it are from the speaker notes. "When a family can meet more than once, high expressed emotion becomes the target of the later meetings" is from the author's earlier description of his practice. The sleep-figure sentence is the addition described above.

## The adaptation page (added 2026-11-17)

"Adapt it for your unit" prints the same workflow with another unit's owners and intervals. It adds no sentence to the workflow. Its rules (`workflows/unit-family-meeting.adapt.json`) replace fifteen phrases, each of which names a role or an interval, and the build checks that each phrase is in the workflow exactly once and that, with nothing changed, the result is the workflow word for word.

The page also draws a board of who owns each step in the reader's version and who is also involved. It reads "also involved" off the rewritten words, by the rule the map follows, so with nothing changed the two boards are the same.

What the page does add, and what the reviewer is asked to judge, is in that file: the eight questions, the roles offered for each job, the intervals offered, the board's heading and one line under it, and the two lists headed "You can change" and "What stays fixed". All of it is Claude's (`docs/DECISIONS.md`, ADR-003 and D15 to D18).

The page is under the same release gate as the workflow, because it prints the unit's procedure.

## The map (added 2026-11-17)

"How it fits together" draws the workflow as a board and adds no sentence to it. Two things about the workflow file changed to make the board true to the procedure.

- **The roles are named as the owner labels name them.** The file had one role, "Psychiatrist, APP or resident", wherever the procedure said either "Psychiatrist / APP / resident" or "Psychiatrist". The file now has both roles, and each step lists the one its own label names. Since the author's instruction of 2026-11-17 (the table above), steps 1, 6, 7 and 8 belong to "Psychiatrist / APP / resident", and "Psychiatrist" is named at steps 3, 4 and 5.
- **A role is listed as also involved wherever a step's words name it.** That added the psychiatrist at booking (the meeting goes on the psychiatrist's calendar) and when the family is brought up (the psychiatrist is told they have arrived). A test compares every mark with the step's words, in both directions.

What the map adds of its own is in `content/maps/how-it-fits.map.json`: an introduction, three headings and four short lines, about 100 words (`docs/DECISIONS.md`, ADR-004, D19 and D20).

## What "de-identified" means here

The pages do not name the unit, the institution, its affiliates or the products in use, and a test fails if any of those names appears in any file or built page (`governance/protected-terms.json`, kept as hashes). They contain no patient, no staff member and no figure from the unit.

They are not anonymous: the site carries its author's name. Whether to publish on those terms is the author's decision, and the attestation command asks for it separately from the clinical review (`docs/DECISIONS.md`, ADR-002 and D11).

The reviewer's working notes on these pages are kept with the private intake files, not in this repository.
