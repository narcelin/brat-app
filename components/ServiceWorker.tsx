'use client'

import { useEffect } from 'react'
import { isReloadSafe, onReloadSafe } from '../lib/pwa/reload-guard'

/** Registers the service worker, and reloads the page once when a new one
 *  takes over.
 *
 *  This lived in the old static `app.js`; when that file was deleted nothing
 *  replaced it, so `public/sw.js` was dead code and the app stopped being
 *  installable. Rendering this from the root layout puts the registration back
 *  into every page's client bundle.
 *
 *  The worker already calls skipWaiting and clients.claim, so a new one takes
 *  control straight away — but the page that is already open keeps running the
 *  JavaScript it loaded, which may be days old. An installed PWA is often
 *  never closed, so that stale code can outlive several deploys. Both a player
 *  and I have chased bugs that were already fixed, so this is worth the
 *  machinery. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Whether this page was already under a worker's control. A first-ever
    // install fires controllerchange too, and reloading there would restart
    // the app the very first time anyone opens it for no reason at all.
    const hadController = Boolean(navigator.serviceWorker.controller)
    let reloaded = false
    let stopWaiting: (() => void) | undefined

    function reloadWhenSafe() {
      if (reloaded) return
      // Never yank the page out from under an unsaved recording. The reload
      // waits for whatever is holding to let go.
      if (!isReloadSafe()) {
        stopWaiting ??= onReloadSafe(reloadWhenSafe)
        return
      }
      reloaded = true
      stopWaiting?.()
      window.location.reload()
    }

    function onControllerChange() {
      if (!hadController) return
      reloadWhenSafe()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    let registration: ServiceWorkerRegistration | undefined
    navigator.serviceWorker
      .register('/sw.js')
      .then((r) => {
        registration = r
      })
      .catch(() => {
        // Registration failing (private mode, unsupported context) must never
        // break the page — the app works fine without the offline shell.
      })

    // An installed PWA can sit in the background for days, and the browser
    // only re-checks sw.js on its own schedule. Asking when the app comes back
    // to the foreground is what makes a deploy reach a phone that is never
    // actually closed.
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      registration?.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisibility)
      stopWaiting?.()
    }
  }, [])

  return null
}
