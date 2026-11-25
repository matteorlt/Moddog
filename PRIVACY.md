# Moddog privacy policy

_Last updated: November 25, 2026_

Moddog is a free, open-source browser extension that checks GitHub repositories for malware before you install them. This policy explains what happens to your data when you use it.

**In short: Moddog has no server. The Moddog project doesn't collect, receive, store or sell any of your data.** Everything happens in your browser, and data only goes to the services you choose to use.

## What Moddog stores on your device

Moddog uses your browser's local extension storage (`chrome.storage.local`). It is never synced to other devices and never sent to the Moddog project.

| Data | Why |
|---|---|
| Your settings: chosen AI provider, model, Ollama address | To remember your choices |
| Your API keys and token (AI provider, VirusTotal, GitHub), if you enter them | To call those services on your behalf |
| Results of past analyses, hashes of analyzed files, cached GitHub answers | To show verdicts instantly and only re-check what changed |

You can delete all of it at any time by removing the extension, or from `chrome://extensions` → Moddog → *Details* → *Site settings* / clearing the extension's data.

## What Moddog sends, and to whom

Moddog only contacts a service when you check a repository, and only the services listed below.

### GitHub (always)

To analyze a repository, Moddog downloads its **public** code, release files and metadata from GitHub (`github.com`, `api.github.com`, `codeload.github.com`, `raw.githubusercontent.com` and GitHub's file hosts). These are the same requests your browser makes when you browse or download from GitHub. If you entered a GitHub token, it is sent to GitHub's API with these requests. GitHub's handling of these requests is covered by the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

### The AI provider you chose (optional)

If you enable AI review, and only when the local checks find something worth explaining, Moddog sends to the provider you picked (Anthropic, OpenAI, Google Gemini or OpenRouter):

- excerpts of the analyzed repository's **public** code that were flagged
- the repository's name, public statistics (stars, forks, dates) and release file names
- the list of signals found by the local checks

This is sent with **your own API key**, directly from your browser to the provider. It is governed by that provider's terms and privacy policy, not by Moddog. Moddog never sends your browsing history, your files, or anything else from your computer.

If you choose **Ollama**, this data goes to the Ollama server address you configured (by default on your own computer, `localhost`) and does not leave your machine.

### VirusTotal (optional)

If you enter a VirusTotal key, Moddog sends the **SHA-256 hash** of each downloaded release file to VirusTotal to look up known malware, using your key. **The files themselves are never uploaded.** See the [VirusTotal privacy policy](https://docs.virustotal.com/docs/privacy-policy).

## What Moddog never does

- No account, no analytics, no tracking, no advertising, no telemetry
- No selling or sharing of data with anyone
- No access to pages other than GitHub repository pages (plus the services above, only once you enable them)
- No reading of your browsing history, passwords, cookies or personal files

## Permissions

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Local settings and cache described above |
| `activeTab` | Read the current tab's address when you open the popup, to know which repository to check |
| GitHub sites | Show the badge on repository pages and download the code to analyze |
| AI providers, VirusTotal, localhost (optional) | Requested only when you enable that service in the settings |

## Children

Moddog doesn't collect personal data from anyone, including children.

## Open source

Moddog's full source code is public at [github.com/matteorlt/Moddog](https://github.com/matteorlt/Moddog), so anyone can verify what it does.

## Changes

If this policy changes, the new version will be published in this file, with its history visible in the repository. Significant changes will be mentioned in the release notes.

## Contact

Questions about privacy: open an issue at [github.com/matteorlt/Moddog/issues](https://github.com/matteorlt/Moddog/issues). For a security problem, please [report it privately](https://github.com/matteorlt/Moddog/security/advisories/new).

Moddog is maintained by Matteo Rannou Le Texier ([@matteorlt](https://github.com/matteorlt)).
