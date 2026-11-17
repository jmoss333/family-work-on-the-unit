# GitHub and Netlify

## The repository and the two sites

| | |
|---|---|
| Repository | <https://github.com/jmoss333/family-work-on-the-unit> (public) |
| Published site | <https://family-work-on-the-unit.netlify.app>, built from `main`: attested pages only |
| Review site | <https://review--family-work-on-the-unit.netlify.app>, built from `review`: every page, each one marked |
| Netlify project | <https://app.netlify.com/projects/family-work-on-the-unit> |

Both sites are public, and both ask search engines not to index them.

## Setting it up, once

All five steps were done on 2026-11-17. They are kept here so the setup can be repeated or checked.

1. **Create the repository.** Open <https://github.com/new?name=family-work-on-the-unit&owner=jmoss333&visibility=public> and create it empty: no README, no licence, no .gitignore.
2. **Push both branches** from this folder:

   ```bash
   git remote add origin https://github.com/jmoss333/family-work-on-the-unit.git
   git push -u origin main
   git push -u origin review
   ```

   With the GitHub CLI, steps 1 and 2 are one line: `gh repo create jmoss333/family-work-on-the-unit --public --source=. --remote=origin --push && git push -u origin review`.
3. **Link Netlify to the repository.** In the Netlify project: Project configuration > Developer settings > Continuous deployment > Link repository > GitHub > `family-work-on-the-unit`. Netlify reads the build command and the publish folder from `netlify.toml`; change nothing.
4. **Turn on the review site.** On the same page: Branches and deploy contexts > Configure > "Let me add individual branches" > `review`. The review site is built on the next push to `review`.
5. **Check.** The published site shows "Nothing is published yet" and a governance page. The review site shows 20 pages, each marked "In review" or "Attested upstream".

## How a change reaches each site

| You push to | Netlify builds | Channel | It reaches |
|---|---|---|---|
| `review` | a branch deploy | review | the review site |
| a pull request into `main` | a deploy preview | review | a preview address shown on the pull request |
| `main` | production | public | the published site |

`netlify.toml` sets the build command, the publish folder and the channel for each context. The tests run before every build. A failing test fails the deploy, and Netlify keeps serving the last good one.

The published site shows nothing that is not attested. With no page attested it is an empty shell and a governance page. That is the starting state, not a fault.

## The working copy on your Mac

The folder the first build was delivered to holds the build as it stood on 2026-11-15, and it is not a git working copy. Keep it as a dated copy:

```bash
cd ~/"Family Inpatient Guide"
mv family-work-on-the-unit family-work-on-the-unit-2026-11-15
```

Then put the working copy in its place. Either unzip the delivered archive there (it is already a git repository with both branches), or clone:

```bash
git clone https://github.com/jmoss333/family-work-on-the-unit.git
cd family-work-on-the-unit
npm test && npm run build && open dist/index.html
```

The dated copy also holds the working review of the design brief, which is deliberately not in the repository.

## Publish a page

```bash
git switch review && git pull              # work on the review branch
npm run build && open dist/index.html      # read the page as it will ship
npm run attest -- room/shift-one-exchange  # sign it, at your terminal
git add governance/ledger.json
git commit -m "Attest: Shift one exchange"
git push                                   # the review site now shows it as attested
```

Then open a pull request from `review` into `main` on GitHub and merge it. The merge is what publishes. Attest several pages before you merge, so one production deploy carries them all.

The two pages under "Build the system" ask one more question when you attest them: that the page identifies no one, reports no figure from the unit, and may be published. Type `released` to confirm, or anything else to leave the page in review.

To publish the two imported pages on the strength of your earlier Clerkship Library review, set `"acceptUpstreamAttestation": true` in `site.config.json` (`docs/DECISIONS.md`, D3).

## Who can see it, and how to change that

Public for now, by the owner's decision of 2026-11-16.

| To | Where |
|---|---|
| Put a password on the review site, or on everything | Netlify: Project configuration > General > Visitor access. The team's plan includes password protection |
| Take the site down | Netlify: put a password on everything, or delete the project (Project configuration > General) |
| Make the repository private | GitHub: Settings > General > Danger Zone > Change repository visibility |

Two things to know before relying on a later change. What has been public can have been copied, cached or forked, and a setting does not recall it. And until a page is attested, its draft text is readable in the repository and on the review site, marked "In review".

## Search engines

Off. To turn indexing on, make one commit that sets `"indexable": true` in `site.config.json` and deletes the `X-Robots-Tag` line in `netlify.toml`. A test fails if the two disagree. The review site is never indexable.

## Costs to expect

Your Clerkship Library notes (2026-09-10) record that Netlify bills each production deploy and does not bill build minutes, previews or branch deploys. If that still holds, every push to `main` costs a deploy and pushes to `review` cost nothing. This site builds in a few seconds and installs nothing.

## If a deploy fails

A red deploy means a test failed or the sources are inconsistent. The log names the test or the file. The usual causes:

- a link to a page that does not exist
- a citation with no entry in the evidence register
- an imported file that was edited
- a ledger row edited by hand, or a reviewed row for a "Build the system" page with no release record
- a protected name in a file. The log gives the file and the line and never the name; `node tools/protect-term.mjs scan` gives the same report locally

Netlify's deploy logs for this project are public, like the repository. That is why no test or build message prints a protected name.

## Running the checks on GitHub as well

Optional. Netlify already runs the tests before every build. To have GitHub run them on every push and pull request, copy `docs/github-workflow-ci.yml` to `.github/workflows/ci.yml` and push. The file is delivered under `docs/` because the assistant that wrote this repository is not permitted to place workflow files. If GitHub refuses the push, the token lacks the `workflow` scope: `gh auth refresh -s workflow`.
