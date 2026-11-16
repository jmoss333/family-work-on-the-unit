#!/usr/bin/env python3
"""One-time intake: lift the six move cards and the boundaries page out of the Astra
design brief WITHOUT retyping them.

    pandoc -f docx -t gfm --wrap=none Family_Work_on_the_Unit_Design_Brief.docx -o brief.md
    python3 tools/intake_from_brief.py brief.md .

Not part of the site build. The brief itself is private (it links private stores) and is
deliberately not committed; this script is kept so the provenance of every Astra-derived
sentence stays reproducible. Each output file is plain teaching text: no front matter, so
`git hash-object <file>` is the hash a faculty attestation binds to.

The only transformations are structural:
  - the bold run-in labels ("**When to use or pause.**") become level-2 headings;
  - the model line (the paragraph that opens with a curly quote) becomes a blockquote;
  - pandoc's underline wrappers around link text are removed.
No wording is changed.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

CARD_FILES = {
    1: "01-prepare-a-meeting.md",
    2: "02-hear-what-each-person-means.md",
    3: "03-identify-an-interaction-pattern.md",
    4: "04-shift-one-exchange.md",
    5: "05-make-a-plan-both-people-can-own.md",
    6: "06-close-with-follow-through.md",
}
CARD_TITLES = {
    1: "Prepare a meeting",
    2: "Hear what each person means",
    3: "Identify an interaction pattern",
    4: "Shift one exchange",
    5: "Make a plan both people can own",
    6: "Close with follow through",
}
LABELS = ("When to use or pause", "Misstep and repair", "Evidence and supervision")
# Page-furniture lines pandoc lifts out of the brief's running headers.
RUNNING_HEADER = re.compile(r"^[A-Z][A-Za-z ]+ / [A-Z]")


def clean_links(text: str) -> str:
    text = re.sub(r"\[<u>(.*?)</u>\]", r"[\1]", text)
    text = re.sub(r'\[<span class="underline">(.*?)</span>\]', r"[\1]", text)
    return text


def paragraphs(lines: list[str]) -> list[str]:
    return [line.strip() for line in lines if line.strip()]


def card_block(lines: list[str], number: int) -> list[str]:
    title = CARD_TITLES[number]
    start = next(i for i, line in enumerate(lines) if line.strip() == f"## {number} {title}")
    end = len(lines)
    for i in range(start + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped.startswith("# ") or stripped.startswith("## ") or RUNNING_HEADER.match(stripped):
            end = i
            break
    return paragraphs(lines[start + 1 : end])


def render_card(paras: list[str]) -> str:
    out: list[str] = []
    for para in paras:
        label = next((name for name in LABELS if para.startswith(f"**{name}.** ")), None)
        if label:
            out.append(f"## {label}")
            out.append(para[len(f"**{label}.** ") :])
        elif para.startswith("“"):
            out.append("> " + para)
        else:
            out.append(para)
    return "\n\n".join(out) + "\n"


def boundaries_block(lines: list[str]) -> str:
    start = next(i for i, line in enumerate(lines) if line.strip() == "# Choice and confidentiality")
    end = next(i for i, line in enumerate(lines) if line.strip() == "## A bounded role for AI")
    out: list[str] = []
    for para in paragraphs(lines[start + 1 : end]):
        if RUNNING_HEADER.match(para):
            continue
        if para.startswith("### "):
            out.append("## " + para[4:])
        else:
            out.append(clean_links(para))
    return "\n\n".join(out) + "\n"


def main() -> int:
    brief = Path(sys.argv[1]).read_text(encoding="utf-8").split("\n")
    root = Path(sys.argv[2])
    for number, name in CARD_FILES.items():
        text = render_card(card_block(brief, number))
        (root / "content" / "cards" / name).write_text(text, encoding="utf-8")
        print(f"card {number}: {name} ({len(text)} bytes)")
    text = boundaries_block(brief)
    (root / "content" / "pages" / "boundaries-choice-and-confidentiality.md").write_text(text, encoding="utf-8")
    print(f"boundaries page ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
