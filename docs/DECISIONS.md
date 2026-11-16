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
