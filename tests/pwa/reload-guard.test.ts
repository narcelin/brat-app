import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  holdReload, isReloadSafe, onReloadSafe, resetReloadGuard,
} from '../../lib/pwa/reload-guard'

beforeEach(() => resetReloadGuard())

describe('reload guard', () => {
  it('is safe when nothing is holding', () => {
    expect(isReloadSafe()).toBe(true)
  })

  it('is unsafe while a hold is out', () => {
    const release = holdReload()
    expect(isReloadSafe()).toBe(false)
    release()
    expect(isReloadSafe()).toBe(true)
  })

  // Two things can hold at once. The first release must not make it look safe
  // while the second still holds an unsaved recording.
  it('stays unsafe until every hold is released', () => {
    const a = holdReload()
    const b = holdReload()
    a()
    expect(isReloadSafe()).toBe(false)
    b()
    expect(isReloadSafe()).toBe(true)
  })

  it('notifies once the last hold goes', () => {
    const seen = vi.fn()
    onReloadSafe(seen)
    const a = holdReload()
    const b = holdReload()
    a()
    expect(seen).not.toHaveBeenCalled()
    b()
    expect(seen).toHaveBeenCalledTimes(1)
  })

  // A component unmounting twice would otherwise drive the count negative,
  // and a later genuine hold would then read as "safe" — reloading away a
  // recording in progress.
  it('ignores a repeated release', () => {
    const release = holdReload()
    release()
    release()
    release()
    const other = holdReload()
    expect(isReloadSafe()).toBe(false)
    other()
    expect(isReloadSafe()).toBe(true)
  })

  it('stops notifying after unsubscribe', () => {
    const seen = vi.fn()
    onReloadSafe(seen)()
    holdReload()()
    expect(seen).not.toHaveBeenCalled()
  })
})
