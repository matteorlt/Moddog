# Contributing to Moddog

Thanks for helping keep the modding community safe! 🐕

## Ways to help

- **Report a false positive** (a safe mod flagged as dangerous) or a **false negative** (malware Moddog missed) with the issue templates
- **Add or improve detection rules** in `src/lib/heuristics.ts`
- **Fix bugs and improve the UI**
- **Translate** (coming soon)

## Development

```bash
npm install
npm run watch   # rebuilds dist/ on change
npm run check   # typecheck + production build: must pass before a PR
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode), then click the reload icon after each rebuild.

## Writing detection rules

Rules are regular expressions run on source files and on text extracted from release files. A good rule:

- targets **behavior aimed at the user's secrets or system** (credentials, tokens, wallets, persistence, antivirus tampering, exfiltration), not ordinary mod features like networking or update checks
- comes with **an example of real malware** it catches (link to a report or describe the sample, **never commit live malware**)
- has been checked against a few **popular legitimate mods** so it doesn't flood users with false positives
- uses the right severity: `critical` and `high` for behavior that is almost never legitimate

Remember that local rules only flag snippets; the AI and antivirus checks make the final call.

## Security rules for contributors

- Never commit API keys, tokens or real malware samples
- Treat everything coming from a repository being analyzed as **untrusted**: render it with `textContent`, never `innerHTML`, and keep it inside the `<untrusted_repo_content>` block of AI prompts
- Don't add new permissions or network destinations without explaining why in the PR

## Sign your commits (DCO)

By contributing, you certify that you wrote the code (or have the right to submit it) and agree to license it under the project's GPL-3.0 license, per the [Developer Certificate of Origin](https://developercertificate.org/). Add a sign-off to each commit:

```bash
git commit -s -m "Add rule for XYZ stealer"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line.

## Pull requests

1. Fork and create a branch from `main`
2. Keep PRs focused: one rule, fix or feature per PR
3. Make sure `npm run check` passes
4. Describe what changed and how you tested it
