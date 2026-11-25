# Security policy

Moddog handles users' API keys and analyzes code written by potential attackers, so security issues in Moddog itself are taken seriously.

## Reporting a vulnerability

**Please don't open a public issue.** Use GitHub's private reporting instead: go to the **Security** tab of this repository and click **Report a vulnerability**.

Examples of what to report:

- A way for a malicious repository to inject HTML/scripts into the Moddog badge, popup or options page
- A way to make API keys leak to anyone other than the provider the user chose
- Prompt-injection techniques that reliably make the AI report malware as clean
- Excessive permissions or unexpected network requests

You'll get an answer as soon as possible. Please give a reasonable amount of time to fix the issue before disclosing it publicly.

## Malware that Moddog missed

That's not a vulnerability in Moddog: open a **False negative** issue so a detection rule can be added. Don't attach live malware; link to the repository or a public analysis instead.
