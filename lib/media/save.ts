/** How to hand a captured file back to the player.
 *
 *  'share'    — the native share sheet. On iOS this is the only reliable way to
 *               get a file into Photos, and it does not navigate the page.
 *  'download' — a programmatic anchor click. Correct on desktop, where the
 *               `download` attribute is honoured.
 *
 *  The distinction matters because iOS Safari IGNORES `download` on a `blob:`
 *  URL and navigates to it instead, replacing the app. So the download path
 *  must always open in a new context rather than the current one. */
export type SaveStrategy = 'share' | 'download'

interface ShareCapableNavigator {
  share?: unknown
  canShare?: (data: { files: File[] }) => boolean
}

/** Injected navigator so this is testable without a browser. */
export function chooseSaveStrategy(nav: ShareCapableNavigator, file: File): SaveStrategy {
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') {
    return 'download'
  }
  try {
    return nav.canShare({ files: [file] }) ? 'share' : 'download'
  } catch {
    // Some browsers throw rather than returning false for unsupported types.
    return 'download'
  }
}
