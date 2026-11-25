# 🐕 Moddog

**Let the dog sniff it first.**

Moddog is a free, open-source browser extension that checks GitHub repositories (and their release files) for malware **before** you install them. It's built for the modding community: gamers downloading mods, tools and scripts who aren't developers and just want to know *"is this safe?"*.

> ⚠️ Moddog gives a risk assessment, not a guarantee. Always be careful with files from unknown sources.

## What it does

Open any GitHub repository: a Moddog badge appears in the corner. Click it and Moddog sniffs:

| Check | What it looks for | Cost |
|---|---|---|
| 🧾 **Reputation** | Brand-new accounts, sudden star spikes, password-protected archives, executables in releases | Free |
| 🔬 **Static analysis** | Discord/Telegram exfiltration, token & password stealing, crypto wallet theft, hidden PowerShell, download-and-execute, persistence, antivirus tampering, big base64 payloads… in the source **and** inside release files (`.jar`, `.zip`, binaries) | Free, runs locally |
| 🦠 **Antivirus** | Release files are hashed and looked up on VirusTotal. The files themselves are never uploaded | Free with your own VirusTotal key (optional) |
| 🧠 **AI explanation** | Only the suspicious snippets go to the AI of your choice, which explains the verdict in plain English and spots antivirus false positives | Your own key, or **free and local with Ollama** |
| ⚡ **Cache** | Versions already checked load instantly. New commits are re-checked as a diff, and a force-push triggers a full re-scan | Free |

The AI only runs when local checks find something worth explaining, so clean repos don't cost you anything.

### Verdicts

| | Label | Meaning |
|---|---|---|
| 🟢 | **Good boy** | Nothing suspicious found |
| 🟡 | **Odd smell** | Something smells odd, have a look |
| 🟠 | **Growling** | Risky behavior detected |
| 🔴 | **Barking!** | Looks like malware, don't install |

## Install (development build)

Moddog isn't on the Chrome Web Store yet. To try it:

```bash
git clone https://github.com/matteorlt/Moddog.git
cd Moddog
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the `dist/` folder. Works in Chrome, Edge, Brave and other Chromium browsers.

Use `npm run watch` while developing and `npm run check` (typecheck + build) before opening a pull request.

## Setup

The settings page opens on install (or right-click the icon → *Options*):

- **AI provider**: Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, or **Ollama** (local, free, no key). Pick "None" to use local checks only.
- **VirusTotal key** (optional): free personal key from [virustotal.com](https://www.virustotal.com/).
- **GitHub token** (optional, rarely needed): see [GitHub limits](#github-limits) below.

💡 Create dedicated API keys with a spending limit.

## Privacy

- **No Moddog server, no account, no tracking, no ads.**
- Keys are stored in `chrome.storage.local` (never synced) and are only sent to the provider you picked.
- Moddog asks for access to a provider's domain only when you enable it.
- VirusTotal receives file **hashes**, never files.
- The AI only receives excerpts of public code from the repository being checked.

## GitHub limits

Moddog avoids GitHub's API wherever it can, so it works fine without a token:

| What | How | Counts toward the API limit? |
|---|---|---|
| Default branch + latest commit | `github.com/<repo>.git/info/refs` (the protocol `git clone` uses) | No |
| Source code | One zip from `codeload.github.com` | No |
| What changed since last time | Compared locally with the hashes of each file in the cache | No |
| Release files | Direct download links | No |
| Reputation + release list | REST API with ETags (an unchanged answer is free) | Yes, about 3 calls per new repo |

Without a token GitHub allows 60 API calls per hour, so about 20 new repositories per hour; already-sniffed ones cost almost nothing. When the limit is reached Moddog keeps going: it reads the release list and the star/fork counts from the GitHub page and only skips account-age checks. Very large repositories (zip over 40 MB) fall back to the API file list plus the most important files.

## How it works

```
GitHub page ──▶ content script (badge) ──▶ background service worker
                                            ├─ head commit via git info/refs, release via API (+ETag) or page
                                            ├─ cache hit? (same commit + same release files) ──▶ instant verdict
                                            ├─ reputation checks (API, or page counters if limited)
                                            ├─ source zip from codeload ─▶ static rules (changed files only)
                                            ├─ release files: sha256 ─▶ VirusTotal, unzip/strings ─▶ static rules
                                            └─ AI (only if something was flagged) ─▶ structured JSON verdict
```

| File | Role |
|---|---|
| `src/lib/analyze.ts` | Orchestrates the pipeline and the cache |
| `src/lib/heuristics.ts` | Detection rules (**the best place to contribute**) |
| `src/lib/binary.ts` | Hashing, `.jar`/`.zip` unpacking, string extraction |
| `src/lib/reputation.ts` | GitHub reputation signals |
| `src/lib/virustotal.ts` | Hash lookups |
| `src/lib/ai.ts` | AI providers, prompt (with prompt-injection guard), verdict validation |
| `src/content.ts`, `src/popup/`, `src/options/` | UI |

## Roadmap

- [ ] GitLab support
- [ ] Firefox build
- [ ] Better `.class` / .NET decompilation for release files
- [ ] YARA rules (WebAssembly)
- [ ] Badge for mod authors ("Sniffed by Moddog")
- [ ] Discord bot
- [ ] Chrome Web Store release

## Contributing

Contributions are very welcome, especially new detection rules and false-positive fixes. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

Found a security issue in Moddog itself? See [SECURITY.md](SECURITY.md).

## License

Moddog is free software, licensed under the **GNU General Public License v3.0** ([LICENSE](LICENSE)). You can use, study, modify and share it, and any version you distribute must stay open source under the same license.

The **Moddog name and logo** are not covered by the license. See [TRADEMARK.md](TRADEMARK.md).

© 2026 Matteo Rannou Le Texier ([@matteorlt](https://github.com/matteorlt))
