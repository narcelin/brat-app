'use client'

import { useEffect } from 'react'

/** Registers the offline shell. This lived in the old static `app.js`; when
 *  that file was deleted nothing replaced it, so `public/sw.js` was dead code
 *  and the app stopped being installable. Rendering this from the root layout
 *  puts the registration back into every page's client bundle. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing (private mode, unsupported context) must never
      // break the page — the app works fine without the offline shell.
    })
  }, [])

  return null
}
