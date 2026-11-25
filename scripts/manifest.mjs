// Builds the browser-specific manifest from public/manifest.json (the Chrome one).
//
// - chrome: Chrome, Edge, Brave, Opera / Opera GX (all Chromium): used as-is.
// - firefox: background scripts instead of a service worker, options_ui,
//   a Gecko id, and Firefox's built-in data collection disclosure.

/** Must never change once published on addons.mozilla.org. */
export const FIREFOX_ID = "moddog@matteorlt";

export function manifestFor(target, base) {
  const m = structuredClone(base);
  if (target === "chrome") return m;
  if (target !== "firefox") throw new Error(`Unknown target: ${target}`);

  m.background = { scripts: ["background.js"], type: "module" };

  m.options_ui = { page: m.options_page, open_in_tab: true };
  delete m.options_page;

  m.browser_specific_settings = {
    gecko: {
      id: FIREFOX_ID,
      // 140 (ESR) is the first version with built-in data collection consent.
      strict_min_version: "140.0",
      data_collection_permissions: {
        // Same disclosure as the Chrome Web Store and PRIVACY.md: public code excerpts go to the
        // AI provider the user picks, and the user's own API keys are stored and sent to that service.
        required: ["websiteContent", "authenticationInfo"],
      },
    },
    gecko_android: { strict_min_version: "142.0" },
  };
  return m;
}
