# The voice kit

What may be offered on this site as the author's line, written down as rules a machine can check, and a tool that asks a model for candidate lines and holds each one to those rules before a person sees it.

The site itself calls no model. Nothing in this folder ships, runs in the build or runs in a browser. The tool runs at the owner's terminal, with his key, on briefs about invented people, and what it writes is a draft.

## What is here

| File | Holds | Who changes it |
|---|---|---|
| `profile.md` | The voice in prose: the stance, the moves in order, the ideas, how the sentences sound, what he does not do. Given to the model whole | The author |
| `rules.json` | The same, as rules: what refuses a line and what only advises. The build reads it | A recorded decision (`docs/DECISIONS.md`, D30 to D32) |
| `exemplars.json` | Fifteen lines of his own, each marked for how close it is to speech and whether he has confirmed it | The author. An AI assistant never sets `"confirmed": true` |
| `prompts/` | The instructions a model is given: `system.md` for every request, `scenes.md` and `script.md` for the two kinds of draft | Anyone, with the tests |
| `schemas/` | The shape of the answer the API is asked to return | Anyone, with the tests |
| `briefs/` | Two example briefs | Copy one to start |
| `drafts/` | Where drafts are written. Git ignores it | The tool |

`src/lib/voice.mjs` applies the rules. `tools/voice/` holds the two commands.

## Check a line

Needs no key and no network.

```bash
node tools/voice/lint.mjs --say "Devon, why did you answer for Ari?" --reply --present Ari,Devon
node tools/voice/lint.mjs --site                    # every clinician line the site already carries
node tools/voice/lint.mjs voice/drafts/<file>.json  # a draft, a deck or a script
```

## Draft with a model

```bash
# 1. See exactly what would be sent. Needs no key and sends nothing.
node tools/voice/draft.mjs scenes --brief voice/briefs/scenes.example.json --dry-run

# 2. Send it. The key lives in your shell for this one command, never in a file here.
ANTHROPIC_API_KEY=... node tools/voice/draft.mjs scenes --brief my-brief.json
ANTHROPIC_API_KEY=... node tools/voice/draft.mjs script --brief my-meeting.json --model claude-sonnet-5-5
```

The answer is written to `voice/drafts/` with what the rules said about each line. A scene the rules refuse is marked REFUSED and is still in the file, so you can see what the model tried.

| Kind | You give | You get |
|---|---|---|
| `scenes` | For each scene: a move card, one to three invented people, and the moment in a sentence or two | An opening of up to three lines, a model line of one or two turns, and a note on what the line is for |
| `script` | One meeting: its length (30, 60 or 90), the people, what the patient agreed may be discussed, and its purpose | The clinician's lines for the five parts, each marked as a question, a reflection, an idea, a limit, a plan or thanks. What follows the meeting is copied from the unit workflow, not drafted |

## The gates, in order

| # | Gate | Kind | What stops here |
|---|---|---|---|
| 1 | The brief is screened | Machine | A brief not marked fictional; an email, phone number, date, year, age or long number; a name on the protected list; a moment longer than 80 words; a topic a short scene cannot hold; a meeting the patient was not asked about |
| 2 | The model's own limits | Model | It is told to write nothing for a brief that reads like a real person, and to say so |
| 3 | Every drafted line is held to `rules.json` | Machine | A line that asks why, passes a verdict, labels a person, guarantees an outcome, presses, uses a clinical term or a figure, runs long, or (as a model line) ends without handing the floor back |
| 4 | **You edit the draft** | **Person** | Everything a rule cannot see: whether the line is right, kind, and yours |
| 5 | You copy what you keep into a deck, and the build checks it again | Person, then machine | The same rules, now with the power to fail the build |
| 6 | **Faculty attestation** of the page | **Person** | The page stays out of the public build until its exact text is attested (`README.md`, "The one rule") |
| 7 | A patient or support-person advisor reads the scenes | **Person** | Wording that adds pressure. Nobody has been named yet (`docs/DECISIONS.md`, D7) |

Gates 1, 3 and 5 are tested (`tests/voice.test.mjs`, `tests/scenes.test.mjs`). Gates 4, 6 and 7 are the ones that matter, and no test stands in for them.

## What never goes into a brief

Anything about a real person. A brief is a sentence or two about people you made up. The screen in gate 1 catches the shapes a record has; it cannot tell a true story told with new names, and a de-identified story is still someone's story. If a meeting you led gives you an idea for a scene, change the people, the relationship and the subject until the family in the room would not find themselves in it.

Whether your institution permits sending any text to this API is a question for its rules, not for this kit. The kit is built so that the question never comes up: nothing real is sent.

## What the rules cannot do

They hold a line to a form. They cannot tell a good move from a bad one: the rehearsal on this site teaches from four missteps, and all four pass every rule (`tests/voice.test.mjs` records that). They cannot tell whether a line is his; `profile.md` says how sure each part of the description is, and the least sure part is how the sentences sound.

## If the API changes

`tools/voice/api.mjs` states the request it sends and the day that shape was read from the API reference. A request that starts failing with a 400 means the reference has moved: read it again, change that one file and its test.
