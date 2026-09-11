/** Whether it is safe to reload the page out from under the player.
 *
 *  A new service worker taking control means the running page is executing
 *  stale code, and the only cure is a reload. But this app holds unsaved work
 *  in memory: a recording in progress, or a finished take sitting on the
 *  review screen that has not been uploaded yet. Reloading either one throws
 *  the recording away with no way to get it back.
 *
 *  So a reload is requested, not taken. Anything holding unsaved work takes a
 *  hold; the reload waits until the last hold is released. */
type Listener = () => void

let holds = 0
const listeners = new Set<Listener>()

/** Take a hold. Call the returned function to release it. */
export function holdReload(): () => void {
  holds += 1
  let released = false
  return () => {
    // Guarded so a double release — a component unmounting twice under Strict
    // Mode, say — cannot drive the count negative and make a real hold look
    // like no hold at all.
    if (released) return
    released = true
    holds -= 1
    if (holds === 0) for (const listener of [...listeners]) listener()
  }
}

export function isReloadSafe(): boolean {
  return holds === 0
}

/** Called when the last hold is released. Returns an unsubscribe. */
export function onReloadSafe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test seam only. */
export function resetReloadGuard(): void {
  holds = 0
  listeners.clear()
}
