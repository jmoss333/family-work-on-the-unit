#!/usr/bin/env python3
"""One-time intake: build evidence/register.json.

    python3 tools/intake_evidence_from_brief.py brief.md evidence/register.json

Two kinds of text end up in the register, and each record says which it carries:

  summaryBy = "astra-brief"   the paragraph is lifted verbatim from the design brief
  summaryBy = "claude"        a short restatement of the paper's abstract, written for this
                              build (the brief had no entry for that paper)

Everything under "citation" and "check" was looked up on 2026-11-15 in PubMed (or, for the
one paper PubMed does not index, on the journal's own page). That is a machine check of
identity and of the figures quoted; it is NOT a faculty review of the interpretation, and
the register page says so.

Not part of the site build.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CHECKED_ON = "2026-11-15"

# id -> (run-in label exactly as it opens the paragraph in the brief)
BRIEF_LABELS = {
    "D1": "**D1 · Jacobsen et al., 2018.**",
    "D2": "**D2 · Lee et al., 2018.**",
    "D3": "**D3 · Haselden et al., 2019.**",
    "X1": "**X1 · Nichols and Fellenberg, 2000.**",
    "X2": "**X2 · Miklowitz et al., 2003.**",
    "X3": "**X3 · Rising et al., 2023.**",
}

RECORDS = [
    {
        "id": "D1", "class": "D", "group": "Direct adult inpatient evidence",
        "registryId": "jacobsen-2018-open-dialogue-locked-unit",
        "short": "Jacobsen et al., 2018",
        "citation": {
            "authors": "Jacobsen RK, Sørgård J, Karlsson BE, Seikkula J, Kim HS",
            "year": 2018,
            "title": "“Open Dialogue behind locked doors” – exploring patients’, family members’, and professionals’ experiences with network meetings in a locked psychiatric hospital unit: A qualitative study",
            "journal": "Scandinavian Psychologist", "volume": "5", "pages": "e5",
            "doi": "10.15714/scandpsychol.5.e5",
        },
        "design": "Qualitative study", "setting": "Locked psychiatric unit, Norway",
        "sample": "5 patients and 6 relatives (written accounts); 5 professionals (focus group)",
        "check": {
            "source": "Journal page (not indexed in PubMed)", "result": "matches",
            "notes": [
                "The two network leaders were nurses and social workers; the staff focus group was four psychiatrists and one psychologist.",
            ],
        },
    },
    {
        "id": "D2", "class": "D", "group": "Direct adult inpatient evidence",
        "registryId": "lee-2018-brief-family-centred-care",
        "short": "Lee et al., 2018",
        "citation": {
            "authors": "Lee HJ, Lin EC, Chen MB, Su TP, Chiang LC",
            "year": 2018,
            "title": "Randomized, controlled trial of a brief family-centred care programme for hospitalized patients with bipolar disorder and their family caregivers",
            "journal": "International Journal of Mental Health Nursing", "volume": "27", "issue": "1", "pages": "61–71",
            "pmid": "28000377", "doi": "10.1111/inm.12294",
        },
        "design": "Randomised controlled trial", "setting": "Inpatient, one medical centre, northern Taiwan",
        "sample": "47 patient–caregiver dyads",
        "check": {
            "source": "PubMed", "result": "matches",
            "notes": [
                "E-published December 21, 2016; the print issue is 27(1), 2018.",
                "Both arms were invited to a routine 60-minute family discussion group; the four 90-minute sessions were in addition to it.",
            ],
        },
    },
    {
        "id": "D3", "class": "D", "group": "Inpatient evidence with mixed ages and an indirect outcome",
        "registryId": "haselden-2019-family-involvement-followup",
        "short": "Haselden et al., 2019",
        "citation": {
            "authors": "Haselden M, Corbeil T, Tang F, Olfson M, Dixon LB, Essock SM, Wall MM, Radigan M, Frimpong E, Wang R, Lamberti S, Schneider M, Smith TE",
            "year": 2019,
            "title": "Family Involvement in Psychiatric Hospitalizations: Associations With Discharge Planning and Prompt Follow-Up Care",
            "journal": "Psychiatric Services", "volume": "70", "issue": "10", "pages": "860–866",
            "pmid": "31310186", "pmcid": "PMC6773477", "doi": "10.1176/appi.ps.201900028",
        },
        "design": "Retrospective record review with Medicaid claims (observational)",
        "setting": "Two urban hospitals, New York, 2012–2013",
        "sample": "179 inpatients with Medicaid",
        "check": {
            "source": "PubMed and PubMed Central", "result": "matches-with-notes",
            "notes": [
                "The paper also reports a 30-day outcome (OR 3.07, 95% CI 1.29–7.32); the summary above gives only the 7-day result.",
                "The count of 31 youth could not be confirmed from the abstract or the article body; the paper defines youth as under 21, and the count is presumably in its Table 1.",
            ],
        },
    },
    {
        "id": "X1", "class": "X", "group": "Extrapolated process and treatment evidence",
        "registryId": "nichols-2000-enactments-process",
        "short": "Nichols and Fellenberg, 2000",
        "citation": {
            "authors": "Nichols MP, Fellenberg S",
            "year": 2000,
            "title": "The effective use of enactments in family therapy: a discovery-oriented process study",
            "journal": "Journal of Marital and Family Therapy", "volume": "26", "issue": "2", "pages": "143–152",
            "pmid": "10776602", "doi": "10.1111/j.1752-0606.2000.tb00285.x",
        },
        "design": "Process study of videotaped sessions", "setting": "Structural family therapy (not inpatient)",
        "sample": "21 segments from 18 sessions",
        "check": {"source": "PubMed", "result": "matches", "notes": []},
    },
    {
        "id": "X2", "class": "X", "group": "Extrapolated process and treatment evidence",
        "registryId": "miklowitz-2003-fft-bipolar",
        "short": "Miklowitz et al., 2003",
        "citation": {
            "authors": "Miklowitz DJ, George EL, Richards JA, Simoneau TL, Suddath RL",
            "year": 2003,
            "title": "A randomized study of family-focused psychoeducation and pharmacotherapy in the outpatient management of bipolar disorder",
            "journal": "Archives of General Psychiatry", "volume": "60", "issue": "9", "pages": "904–912",
            "pmid": "12963672", "doi": "10.1001/archpsyc.60.9.904",
        },
        "design": "Randomised controlled trial", "setting": "Outpatient, after an acute episode",
        "sample": "101 patients",
        "check": {
            "source": "PubMed", "result": "matches",
            "notes": [
                "The comparison arm was two family-education sessions plus crisis intervention as needed. Relapse was 35% versus 54% (hazard ratio 0.38, 95% CI 0.20–0.75).",
            ],
        },
    },
    {
        "id": "X3", "class": "X", "group": "Extrapolated educational evidence",
        "registryId": "rising-2023-uncertainty-communication",
        "short": "Rising et al., 2023",
        "citation": {
            "authors": "Rising KL, Cameron KA, Salzman DH, Papanagnou D, Doty AMB, Piserchia K, Leiby BE, Shimada A, McGaghie WC, Powell RE, Klein MR, Zhang XC, Vozenilek J, McCarthy DM",
            "year": 2023,
            "title": "Communicating Diagnostic Uncertainty at Emergency Department Discharge: A Simulation-Based Mastery Learning Randomized Trial",
            "journal": "Academic Medicine", "volume": "98", "issue": "3", "pages": "384–393",
            "pmid": "36205492", "pmcid": "PMC13431072", "doi": "10.1097/ACM.0000000000004993",
        },
        "design": "Waitlist randomised controlled trial", "setting": "Emergency medicine residency, two sites",
        "sample": "109 resident physicians",
        "check": {
            "source": "PubMed", "result": "matches",
            "notes": [
                "Participants were resident physicians. At the first retest 52.7% of the trained group met the mastery standard versus 3.7% of the waitlist group.",
            ],
        },
    },
    {
        "id": "R1", "class": "R", "group": "Pooled estimates quoted in this companion",
        "registryId": "rodolico-2022-family-interventions-nma",
        "short": "Rodolico et al., 2022",
        "citation": {
            "authors": "Rodolico A, Bighelli I, Avanzato C, Concerto C, Cutrufelli P, Mineo L, Schneider-Thoma J, Siafis S, Signorelli MS, Wu H, Wang D, Furukawa TA, Pitschel-Walz G, Aguglia E, Leucht S",
            "year": 2022,
            "title": "Family interventions for relapse prevention in schizophrenia: a systematic review and network meta-analysis",
            "journal": "The Lancet Psychiatry", "volume": "9", "issue": "3", "pages": "211–221",
            "pmid": "35093198", "doi": "10.1016/S2215-0366(21)00437-5",
        },
        "design": "Systematic review and network meta-analysis",
        "setting": "Trials in which all patients were acutely ill were excluded",
        "sample": "90 randomised trials, 10,340 participants",
        "summaryBy": "claude",
        "summary": "Eleven family intervention models were compared for relapse prevention in schizophrenia. At 12 months every model except crisis-oriented interventions and family psychoeducation of two sessions or fewer reduced relapse against treatment as usual. Family psychoeducation alone had the lowest odds of relapse (OR 0.18, 95% CI 0.12–0.27). Because trials of exclusively acutely ill patients were excluded, this is an estimate for a course of family work that continues after the acute phase, not for one inpatient conversation.",
        "check": {"source": "PubMed", "result": "matches", "notes": []},
    },
    {
        "id": "R2", "class": "R", "group": "Pooled estimates quoted in this companion",
        "registryId": "pharoah-2010-family-intervention",
        "short": "Pharoah et al., 2010",
        "citation": {
            "authors": "Pharoah F, Mari J, Rathbone J, Wong W",
            "year": 2010,
            "title": "Family intervention for schizophrenia",
            "journal": "Cochrane Database of Systematic Reviews", "issue": "12", "pages": "CD000088",
            "pmid": "21154340", "pmcid": "PMC4204509", "doi": "10.1002/14651858.CD000088.pub2",
        },
        "design": "Cochrane systematic review and meta-analysis",
        "setting": "Community-oriented family interventions",
        "sample": "53 randomised trials; the relapse estimate pools 32 of them (n = 2,981)",
        "summaryBy": "claude",
        "summary": "Family intervention was associated with fewer relapses than standard care (RR 0.55, 95% CI 0.5–0.6; number needed to treat 7, 95% CI 6–8). The review's authors caution that the effect may be overestimated because of the poor methodological quality of the trials.",
        "check": {
            "source": "PubMed", "result": "matches-with-notes",
            "notes": [
                "PubMed gives the DOI suffix .pub2 for this record; the Psychiatry Clerkship Library's evidence registry lists .pub3 for the same PMID. Confirm which is intended.",
            ],
        },
    },
    {
        "id": "R3", "class": "R", "group": "Pooled estimates quoted in this companion",
        "registryId": "miklowitz-2021-bipolar-psychotherapy-nma",
        "short": "Miklowitz et al., 2021",
        "citation": {
            "authors": "Miklowitz DJ, Efthimiou O, Furukawa TA, Scott J, McLaren R, Geddes JR, Cipriani A",
            "year": 2021,
            "title": "Adjunctive Psychotherapy for Bipolar Disorder: A Systematic Review and Component Network Meta-analysis",
            "journal": "JAMA Psychiatry", "volume": "78", "issue": "2", "pages": "141–150",
            "pmid": "33052390", "pmcid": "PMC7557716", "doi": "10.1001/jamapsychiatry.2020.2993",
        },
        "design": "Systematic review and component network meta-analysis",
        "setting": "The authors' conclusion concerns outpatients",
        "sample": "39 randomised trials, 3,863 participants",
        "summaryBy": "claude",
        "summary": "Manualised psychotherapies added to medication were associated with fewer recurrences than control treatments (OR 0.56, 95% CI 0.43–0.74). Psychoeducation with guided practice of illness-management skills did better in a family or group format than the same strategies delivered individually (OR 0.12, 95% CI 0.02–0.94). Family or conjoint therapy was associated with better study retention than standard psychoeducation (OR 0.46, 95% CI 0.26–0.82); its effect on depressive symptoms was uncertain.",
        "check": {"source": "PubMed", "result": "matches", "notes": []},
    },
    {
        "id": "R4", "class": "R", "group": "Pooled estimates quoted in this companion",
        "registryId": "ma-2021",
        "short": "Ma et al., 2021",
        "citation": {
            "authors": "Ma CF, Chan SKW, Chung YL, Ng SM, Hui CLM, Suen YN, Chen EYH",
            "year": 2021,
            "title": "The predictive power of expressed emotion and its components in relapse of schizophrenia: a meta-analysis and meta-regression",
            "journal": "Psychological Medicine", "volume": "51", "issue": "3", "pages": "365–375",
            "pmid": "33568244", "doi": "10.1017/S0033291721000209",
        },
        "design": "Meta-analysis of prospective cohort studies",
        "setting": "Cohort studies of people with schizophrenia",
        "sample": "33 studies, 2,284 patients (30 studies pooled)",
        "summaryBy": "claude",
        "summary": "High expressed emotion predicted relapse within 12 months (OR 4.87, 95% CI 3.22–7.36) more strongly than later relapse (OR 2.13, 95% CI 1.36–3.35). Critical comments predicted relapse (OR 2.22, 95% CI 1.16–4.26) and warmth was protective (OR 0.35, 95% CI 0.15–0.85). These are associations from cohort studies; they describe risk, not the effect of a meeting.",
        "check": {"source": "PubMed", "result": "matches", "notes": []},
    },
    {
        "id": "G1", "class": "G", "group": "Guidance and law",
        "short": "HHS guidance on sharing and on listening",
        "summaryBy": "claude",
        "summary": "Two HHS Office for Civil Rights answers on HIPAA and adult mental health information: when a provider may discuss an adult patient's information with family, and what family members can do when they are concerned.",
        "links": [
            {"label": "HHS guidance on sharing", "url": "https://www.hhs.gov/hipaa/for-professionals/faq/health-care-provider-permitted-discuss-adult-patients-mental-health-information-patients.html"},
            {"label": "HHS guidance on listening", "url": "https://www.hhs.gov/hipaa/for-professionals/faq/what-options-do-family-members-adult-patient-mental-illness-have-if-they-are-concerned-about.html"},
        ],
        "check": {
            "source": "hhs.gov", "result": "matches",
            "notes": ["Both pages load and show “Content last reviewed September 12, 2017.”"],
        },
    },
    {
        "id": "G2", "class": "G", "group": "Guidance and law",
        "short": "Maine 34-B §1207(5-A); 42 CFR Part 2; VHA Directive 1163.04(1)",
        "summaryBy": "claude",
        "summary": "Maine's confidentiality statute for mental health information, including subsection 5-A on disclosure to family and caretakers; the federal rule on substance use disorder treatment records; and the Veterans Health Administration directive on family services, whose section 6.b requires private, individual screening before conjoint work.",
        "links": [
            {"label": "Maine statute", "url": "https://legislature.maine.gov/statutes/34-b/title34-Bsec1207.html"},
            {"label": "HHS on Part 2", "url": "https://www.hhs.gov/hipaa/part-2/index.html"},
            {"label": "VA private screening guidance, §6(b)", "url": "https://www.va.gov/VHAPUBLICATIONS/ViewPublication.asp?pub_ID=8390"},
        ],
        "check": {
            "source": "legislature.maine.gov, hhs.gov, va.gov", "result": "matches",
            "notes": [
                "§1207 is titled “Confidentiality of information”; subsection 5-A is headed “Disclosure to family, caretakers.”",
                "The VA document is VHA Directive 1163.04(1), Family Services in Mental Health, dated June 17, 2019 and amended March 7, 2025.",
                "The HHS page states that compliance with the 2024 Part 2 final rule was required by February 16, 2026.",
            ],
        },
    },
    {
        "id": "G3", "class": "G", "group": "Guidance and law",
        "short": "NICE CG178",
        "summaryBy": "claude",
        "summary": "NICE guideline CG178, Psychosis and schizophrenia in adults: prevention and management (2014). It describes family intervention as a course of at least 10 planned sessions over 3 months to 1 year, delivered by competent, supervised practitioners, which can start in the acute phase, including in inpatient settings.",
        "links": [
            {"label": "NICE CG178 §§1.3.7, 1.3.9 and 1.4.4", "url": "https://www.nice.org.uk/guidance/cg178/chapter/Recommendations"},
        ],
        "check": {
            "source": "nice.org.uk (guideline and Quality Standard QS80)", "result": "matches",
            "notes": ["The session count and duration are in recommendation 1.3.7.2; competence in 1.3.9.1; the offer to families and the inpatient start in 1.4.4.2."],
        },
    },
]


def main() -> int:
    brief = Path(sys.argv[1]).read_text(encoding="utf-8")
    paragraphs = [p.strip() for p in brief.split("\n") if p.strip()]

    def lifted(label: str) -> str:
        para = next(p for p in paragraphs if label in p)
        body = para.split(label, 1)[1]
        body = re.split(r"\*\*[DXG]\d · ", body)[0]  # X1 and X2 share one paragraph
        return body.strip()

    def exact(prefix: str) -> str:
        return next(p for p in paragraphs if p.startswith(prefix))

    for record in RECORDS:
        record["check"]["on"] = CHECKED_ON
        if record["id"] in BRIEF_LABELS:
            record["summary"] = lifted(BRIEF_LABELS[record["id"]])
            record["summaryBy"] = "astra-brief"

    intro_para = exact("Targeted source check for design decisions")
    unit_of_evidence = intro_para.split("November 15, 2026. ", 1)[1]
    unresolved = exact("The card wording, retry, observer questions and stop rules")

    register = {
        "schema": 1,
        "checkedOn": CHECKED_ON,
        "checkNote": "Citations and the figures quoted were checked against PubMed, PubMed Central or the publisher's page on the date shown. That is a machine check of identity and numbers. It is not a faculty review of what the studies mean for practice.",
        "intro": unit_of_evidence,
        "introBy": "astra-brief",
        "unresolved": unresolved,
        "unresolvedBy": "astra-brief",
        "classes": {
            "D": {"label": "Direct inpatient evidence", "blurb": "Studies done with people who were in hospital."},
            "X": {"label": "Extrapolated evidence", "blurb": "Process, treatment and educational research from other settings."},
            "R": {"label": "Pooled estimates", "blurb": "Numbers quoted elsewhere in this companion. Each is shown with its setting and dose so it is not read as the effect of one inpatient conversation."},
            "G": {"label": "Guidance and law", "blurb": "Rules and guidelines the boundaries page relies on."},
        },
        "records": RECORDS,
    }
    Path(sys.argv[2]).write_text(json.dumps(register, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {sys.argv[2]}: {len(RECORDS)} records")
    for record in RECORDS:
        print(f"  {record['id']} [{record['summaryBy']:11s}] {record['summary'][:88]}…")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
