# Contributing to Moddog

Thanks for helping keep the modding community safe! 🐕 You don't need to be an expert: reporting a false positive is already a big help.

## Ways to help

| You have… | Do this |
|---|---|
| 5 minutes | Report a [false positive](https://github.com/matteorlt/Moddog/issues/new?template=1-false-positive.yml) or a [missed malware](https://github.com/matteorlt/Moddog/issues/new?template=2-false-negative.yml) |
| An idea for a rule | Open a [rule proposal](https://github.com/matteorlt/Moddog/issues/new?template=3-rule-proposal.yml) |
| An hour | Pick an issue labeled [`good first issue`](https://github.com/matteorlt/Moddog/labels/good%20first%20issue) |
| A question | Ask in [Discussions](https://github.com/matteorlt/Moddog/discussions) |

Comment on an issue before starting on it, so two people don't do the same work.

## Setup

You need Node.js 22.

```bash
git clone https://github.com/<you>/Moddog.git
cd Moddog
npm install
npm run watch      # rebuilds dist/ on every change
```

Load `dist/` in `chrome://extensions` (Developer mode → Load unpacked), then click the reload icon after each rebuild. For Firefox, `npm run build` also creates `dist-firefox/`: load it from `about:debugging`, or run `npm run firefox` to open a test Firefox with Moddog installed.

| Command | What it does |
|---|---|
| `npm run check` | Everything CI runs: typecheck, lint, tests, build. **Run it before every PR** |
| `npm test` | Unit tests (Vitest), `npm run test:watch` while you work |
| `npm run format` | Auto-fixes formatting and simple lint issues (Biome) |
| `npm run package` | Zips both builds: `moddog-<version>-chrome.zip` (Chrome, Edge, Opera) and `moddog-<version>-firefox.zip` |
| `npm run lint:firefox` | Checks the Firefox build with Mozilla's `web-ext lint` |

## Writing detection rules

Rules live in [`src/lib/heuristics.ts`](src/lib/heuristics.ts). They are regular expressions run on source files and on text extracted from release files.

**Every rule needs a test case** in [`tests/rules.cases.ts`](tests/rules.cases.ts): at least one sample it must catch and one legitimate look-alike it must ignore. `npm test` fails otherwise.

```ts
"my-rule": {
  match: ['String hook = "https://evil.example/collect?t=" + token;'],
  noMatch: ['String docs = "https://example.com/collect-your-rewards";'],
},
```

A good rule:

- targets **behavior aimed at the user's secrets or system** (credentials, tokens, wallets, persistence, antivirus tampering, exfiltration), not ordinary mod features like networking or update checks
- is inspired by **real malware**: link the report or analysis in your PR, and **never commit live malware**
- has been tried on a few **popular legitimate mods**, so it doesn't flood users with false positives
- uses the right severity: `critical` and `high` only for behavior that is almost never legitimate

Local rules only flag snippets; the antivirus and AI checks make the final call.

## Security rules for contributors

- Never commit API keys, tokens or real malware samples
- Treat everything coming from an analyzed repository as **untrusted**: render it with `textContent`, never `innerHTML`, and keep it inside the `<untrusted_repo_content>` block of AI prompts
- Don't add permissions or network destinations without explaining why in the PR

## Pull requests

1. Fork, then create a branch from `main` (`fix/discord-rule-false-positive`, `feat/gitlab-support`…)
2. Keep PRs focused: one rule, fix or feature per PR
3. **Sign off every commit** (see below)
4. Run `npm run check`
5. Open the PR and fill in the template

What happens next:

- **CI** runs typecheck, lint, tests and build, and attaches a ready-to-test zip of the extension to the run
- **CodeQL** scans for security issues
- **DCO** checks that every commit is signed off
- **Labels** are added automatically from the files you changed
- The maintainer is asked for a review automatically

### Sign your commits (DCO)

By contributing, you certify that you wrote the code (or have the right to submit it) and agree to license it under the project's GPL-3.0 license, per the [Developer Certificate of Origin](https://developercertificate.org/). Add a sign-off to each commit:

```bash
git commit -s -m "Add rule for XYZ stealer"
```

Forgot? Fix the whole branch with `git rebase --signoff main` then `git push --force-with-lease`.

## Labels

| Label | Meaning |
|---|---|
| `good first issue` | Small, well-defined, great to start with |
| `help wanted` | The maintainer would love help on this |
| `needs-triage` | New report, not looked at yet |
| `false-positive` / `false-negative` | Detection accuracy reports |
| `detection-rules`, `ai`, `github-access`, `ui`, `ci`, `documentation`, `permissions` | Area of the code (added automatically on PRs) |
| `bug`, `enhancement` | Type of change, used to sort release notes |
| `security` | Security-related change in Moddog itself |
| `blocked` | Waiting on something else |

## Releases (maintainer)

1. Bump the version in **both** `package.json` and `public/manifest.json` (CI fails if they differ)
2. Merge to `main`, then tag: `git tag v0.2.0 && git push origin v0.2.0`
3. The release workflow checks everything, packages the extension and publishes a GitHub release with notes generated from PR labels
