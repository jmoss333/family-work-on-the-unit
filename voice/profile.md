# The voice: how the author talks in a family meeting

A working description with two readers: a person drafting lines for this site, and the drafting tool in `tools/voice/`, which hands this file to a model as part of its instructions. It is not teaching text, and no page prints it.

**Status: drafted by Claude in November 2026. The author has not yet confirmed it.** It draws on his teaching materials (the stance and the five parts are his, and are on this site) and on his own de-identified notes on meetings he has led. Only his own general-purpose lines were kept. Nothing a patient or a family member said is in this folder, and nothing about any family.

| Part | Basis | How sure |
|---|---|---|
| 1. The stance | His own teaching | High |
| 2. The moves and their order | The same in his notes and in his teaching | Moderate |
| 3. The ideas he reaches for | Repeated from one meeting to the next | Moderate |
| 4. How the sentences sound | His notes are summaries, and a summary flattens speech: contractions and small words go first | Low, until he confirms `exemplars.json` line by line |

## 1. The stance

PACE, as he teaches it:

- **Playfulness:** warmth and lightness when welcome
- **Acceptance:** acknowledge the experience; keep limits clear
- **Curiosity:** “help me understand” before you explain or correct
- **Empathy:** name what sounds painful; leave room

Four habits carry that stance into sentences.

1. **Every ask leaves a way out.** “You can share whatever you’d like.” A next step is offered, never assigned.
2. **The pattern, not the culprit.** He asks what happens between people. He still holds each adult to their own part, in one plain sentence.
3. **Adult business goes back to the adults.** The patient is not the messenger, the referee or the confidant.
4. **Hope is said plainly.** It lands best tied to something the family just did. It is never a guarantee.

## 2. The moves, in the order he uses them

The five parts are the ones every meeting on this site shares: join each person, hear each experience, work on one exchange, agree what to try, close and review.

| Part | What he does | A line of his |
|---|---|---|
| Join each person | Says why he does family work and thanks the person for coming. Lets each person choose what to share. Begins with whoever was most uneasy about coming | “I appreciate you being willing to come in.” |
| Join each person | One sentence of purpose, then asks what anyone wants covered | “Is there anything anyone wants to make sure we address?” |
| Hear each experience | Asks what and how, about what happens between people | “What has made it hard for the two of you to talk about it?” |
| Work on one exchange | **The hinge.** When one person has said something that matters, he turns to the other and asks what it is like to hear it, before anyone explains. Then he turns back | “What are you feeling as you hear all of this?” |
| Work on one exchange | **Holding a part.** When an adult hands their part to someone else, one short sentence, then a question | “You still make your own decisions.” |
| Work on one exchange | **Out of the middle.** Says in plain words what is not the patient’s to carry | “It really shouldn’t fall on her lap.” |
| Any part, once | **One idea** (section 3), when it helps the family hold what just happened | “The two biggest things are time and consistency.” |
| Agree what to try | One small thing, concrete, and not about the crisis | See `exemplars.json` |
| Close and review | Names something each person did. Invites a last word. Offers what comes next with a way out | “Before we stop, is there anything else either of you needs to say?” |

## 3. The ideas he reaches for

These are ideas, not wording. A draft may use one where it earns its place, in plain words.

- Trust comes back through time and consistency, not through one conversation.
- Anger is information. It turns up most in the relationships that matter most, and it stays small when it is said early.
- Love and anger can be in the room together.
- Guilt is about something done; shame is about who one is. Guilt can point back to what matters.
- Boundaries are not walls. They say what a person needs in order to stay in the relationship.
- The adults are the copilots and the children are passengers. When the copilots stop talking to each other, a passenger tries to fly the plane.
- As a child becomes an adult, a parent’s job moves from manager to consultant.
- A gentle guess (“I wonder if today was a lot”) does more than a repeated question (“Are you okay?”).
- A pause is not an ending: agree when to come back.
- Parents do not have to be perfect. Repairing a mistake where a child can see it teaches more than not making one.
- People listen once they have been heard.

An idea takes the floor. So a script carries one idea for a 30-minute meeting, two for 60 and three for 90, and never two in one part (`rules.json`, `one-frame`). The numbers are a proposal; see `docs/DECISIONS.md`.

## 4. How the sentences sound

- Short. The family’s turn is the long one.
- Plain words and contractions: “it’s”, “can’t”, “you’d”. Small intensifiers: “really”, “a lot”, “a little bit”.
- He names the person he is speaking to.
- Questions begin with what, how, is there or have you.
- A limit is a short statement with no softener. Six words can be enough.
- He says “I” for his own view: “I think it can be really helpful.”

## 5. What he does not do

Each of these is a rule in `rules.json` that refuses a line.

| He does not | Rule |
|---|---|
| Ask a person why | `no-why` |
| Say who is right, who is to blame or how someone ought to feel | `no-verdict` |
| Put a label on a person | `no-label` |
| Guarantee how things will turn out | `no-promise` |
| Press for an apology, forgiveness, touch, eye contact or an answer | `no-pressure` |
| Use a clinical term a family would have to ask about | `no-jargon` |
| Say a number, a dose or a percentage in the room | `no-figures` |
| Hold the floor | `turn-length`, `sentence-length` |

## 6. Where this voice is the wrong tool

A conversation about risk to life, about means, about violence or fear of a person, or about what may be disclosed is not a matter of voice. It belongs in a private conversation, under the unit’s procedure and the stop rules on this site. The kit will not draft those as scenes (`out-of-scope`), and a draft of anything else is a proposal to the faculty reviewer, never a page.

## 7. Changing this file

The author edits it, and marks a line in `exemplars.json` as confirmed himself. A change to `rules.json` is a decision about what the site may print as his, and is recorded in `docs/DECISIONS.md`.
