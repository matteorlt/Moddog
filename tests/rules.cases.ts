/**
 * Every detection rule needs at least one sample it must catch and one look-alike
 * it must ignore. `npm test` fails if a rule has no case here.
 *
 * Adding a rule? Add its case too. Use short snippets inspired by real malware
 * (never paste live payloads) and a legitimate snippet that looks similar.
 */
export const RULE_CASES: Record<string, { match: string[]; noMatch: string[] }> = {
  "discord-webhook": {
    match: ['String hook = "https://discord.com/api/webhooks/1234567890/abcDEF_-xyz";'],
    noMatch: ['String invite = "https://discord.com/invite/modding";'],
  },
  "telegram-bot": {
    match: ['url = "https://api.telegram.org/bot123456:AAH-abc_def/sendDocument"'],
    noMatch: ["// Join us on https://telegram.org"],
  },
  "discord-token-paths": {
    match: [
      'Path p = appData.resolve("discord/Local Storage/leveldb");',
      String.raw`"\\discordcanary\\Local Storage\\leveldb"`,
    ],
    noMatch: ['String discordLink = "https://discord.gg/abc";'],
  },
  "browser-credentials": {
    match: [String.raw`File f = new File(local, "Google\Chrome\User Data\Default\Login Data");`],
    noMatch: ["Please enter your login data below."],
  },
  "minecraft-session": {
    match: ['File f = new File(mcDir, "launcher_accounts.json");', "String t = mc.getSession().getToken();"],
    noMatch: ['accessToken = project.providers.environmentVariable("MODRINTH_API_KEY")'],
  },
  "crypto-wallets": {
    match: ['copy(home + "/Exodus/exodus.wallet")', 'find("wallet.dat")'],
    noMatch: ["Players can store coins in their wallet."],
  },
  "powershell-encoded": {
    match: ['Process.Start("powershell.exe", "-NoP -W Hidden -Enc SQBFAFgA")'],
    noMatch: ['Process.Start("powershell.exe", "Get-ChildItem")'],
  },
  "download-and-execute": {
    match: ["(New-Object Net.WebClient).DownloadFile($u, $p); Start-Process $p"],
    noMatch: ["// See the DownloadFile docs for details."],
  },
  "runtime-exec": {
    match: ['Runtime.getRuntime().exec("cmd /c start x.exe");', 'subprocess.Popen(["sh", "x"])'],
    noMatch: ['System.out.println("execute");'],
  },
  "dynamic-code": {
    match: ["eval(payload)", "ClassLoader l = new URLClassLoader(urls);"],
    noMatch: ["double v = evaluate(expression);"],
  },
  persistence: {
    match: [
      String.raw`reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v x`,
      "schtasks /create /tn Updater /tr x.exe",
    ],
    noMatch: [String.raw`HKLM\Software\Microsoft\Windows\CurrentVersion\Runtime`],
  },
  "defender-tamper": {
    match: ["Set-MpPreference -DisableRealtimeMonitoring $true", String.raw`Add-MpPreference -ExclusionPath C:\Games`],
    noMatch: ["Make sure Windows Defender is up to date."],
  },
  "paste-site-payload": {
    match: ['fetch("https://pastebin.com/raw/aBc123")'],
    noMatch: ["Logs: https://pastebin.com/aBc123"],
  },
  "ip-grabber": {
    match: ['get("https://api.ipify.org?format=json")'],
    noMatch: ["See ipinfo for the docs."],
  },
  "large-base64": {
    match: [`String blob = "${"QUJD".repeat(200)}";`],
    noMatch: [`String icon = "${"QUJD".repeat(20)}";`],
  },
};
