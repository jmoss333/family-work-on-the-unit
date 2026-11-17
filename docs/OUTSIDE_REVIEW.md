# A review from outside

The faculty reviewer attests every page. Before that, or between attestations, it helps to have the site read by someone who did not make it: a colleague, a privacy reader, a person with lived experience, or another AI model. This is how to ask for that reading and what to do with what comes back.

An outside review is an input to the faculty review. It attests nothing, and no finding changes a page by itself.

## 1. Hand out one file

```
node tools/review_packet.mjs --base https://<where the review site is served> --out packet.md
```

The packet holds the words of every page of the review build, in the site's order, with each page's address and the state of its review. It is made from the built pages, so it names nothing the site does not. Give the reviewer the packet and the address of the review site.

Do not give an outside reviewer the procedure the unit workflow was copied from, the private reviewer notes, or anything else that names the unit.

## 2. Ask for a reading the makers cannot give

The prompt below asks for five readings, each from the position of one person who has to use the site or live with it. It was written for an AI model on 2026-11-17; for a person, the five readers and the rules still serve, and the JSON can be a table.

The second paragraph is for a reviewer who had a hand in the design. Leave it out for anyone else.

```text
You are reviewing a small teaching website for inpatient psychiatry teams, "Family Work on the Unit". It teaches residents and attending physicians how to involve a patient's family or chosen supporters during a hospital stay: six move cards, a rehearsal, one unit's workflow, a page that adapts that workflow to another unit, and reference pages. The attached file, the review packet, holds the words of every page. Nearly every page is marked "in review": no faculty member has attested it yet. Your review is one input to that faculty review. It does not replace it.

You helped write the design brief this site grew from. Set the brief aside. Do not check the site against it, do not propose new features, and do not rewrite pages. I am asking for something the brief could not give: a reading from outside.

THE LENS
Read the site five times, each time as one person who did not make it, has a job to do with it, and is short of time. Stay in that person's position. Do not average the five.

1. A second-year resident on night float. A family arrives in ten minutes. Using only the site: what do I say first, when must I not hold a joint meeting, and what do I do when a relative asks about something the patient has not agreed to share? Note every place you had to guess, every place two pages told you different things, and every instruction that would go wrong if followed to the letter.
2. A social worker or a nurse on a different unit, handed the unit workflow and told "your steps start tomorrow". Which of my steps could I not carry out from these words alone? What does a step assume I know, have, or am allowed to do?
3. A patient, and then a family member, reading over the clinician's shoulder. Where would I feel managed, tested, or decided for? Where could my "no" be worked around? Where do the words protect me, and where do they only say they do?
4. A unit lead deciding whether to adopt the workflow, using "Adapt it for your unit", its board and its count of handoffs. What would stop me? What does the page let me change that it should not, and what does it hold fixed that will not survive my unit? Does anything on it look like policy when it is not?
5. A reader looking for trouble: a privacy officer, a lawyer, a reporter. Which sentence would be quoted against the hospital? Where does a claim outrun its evidence as the page itself states it? Which phrases would help someone work out which unit this is? Say which phrases. Do not try to identify the unit, and do not name any institution.

RULES
- Every finding quotes the words it is about, copied exactly from the packet, 4 to 40 words, with the packet's page number. If you cannot quote it, do not report it. For something that is missing, quote the sentence it should stand beside and set "kind" to "missing".
- Say what is wrong and why it matters to that reader. Give a direction in plain words if you have one. Do not draft replacement clinical text.
- Do not add or cite any study, guideline or law that is not already in the packet. If you think a source is misused, quote the sentence and say so.
- Rank by harm to a patient or family first, then to a learner, then to the hospital. At most 25 findings. A finding only one of the five readers would notice is worth more than one all five share.
- Include at least three findings of kind "works-well": words that do their job and should not be lost in revision. Give those severity "low".
- List separately what you could not judge from the text: layout, the page that rewrites itself, anything that turns on local law or policy.
- Give a confidence for each finding. "low" is a useful answer.

RETURN
First, one JSON block in exactly this shape, so that each quote can be checked against the site by script. Leave "page2" and "quote2" out unless the finding is a contradiction between two places.

{
  "reviewer": "<model name and version>",
  "lens": "five cold readers",
  "findings": [
    {
      "id": "F1",
      "reader": "resident | staff | patient | family | unit-lead | hostile",
      "page": 17,
      "quote": "exact words from that page",
      "page2": 4,
      "quote2": "for a contradiction only: the words on the other page",
      "kind": "unsafe | unclear | missing | contradiction | identifiable | tone | works-well",
      "severity": "high | medium | low",
      "what": "what is wrong and for whom, in one or two sentences",
      "direction": "optional: which way a fix lies, in plain words",
      "confidence": "high | medium | low"
    }
  ],
  "could_not_judge": ["..."]
}

Then, in no more than 300 words of prose: the three findings you would act on first and why, and the one thing about this site that a reader from outside sees and its makers probably cannot.
```

## 3. Check what comes back before anyone acts on it

Save the JSON block as a file outside the repository and run:

```
node tools/check_findings.mjs findings.json
```

Each finding must quote words that are on the page it names, as the site stands now. Quotes are compared with typography forgiven (straight or curly quotes, any spacing, any capitals) and words not. A finding that fails is about something the site does not say; it is set aside. The command exits 1 if any finding fails.

Passing says a finding points at real words. It does not say the finding is right.

## 4. Sort the rest

| A finding that | Goes to |
|---|---|
| Points at a mechanical defect (a broken link, two pages that state one rule differently, a label that misleads) | A change on the `review` branch, with a test where one fits |
| Asks for different clinical words | The faculty reviewer, as a proposal. An assistant does not write them |
| Turns on local law or policy | The privacy or legal reader (`docs/DECISIONS.md`, D7) |
| Says something works | The reviewer notes, so that a later revision keeps it |
| Is declined | The reviewer notes, with the reason |

Record the review in `docs/DECISIONS.md` under "Decided": who read, through what lens, how many findings passed the check, and what was done with them.
