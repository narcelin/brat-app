'use client'

import { useClerk } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from './Avatar'

/** Your brat IS the account button.
 *
 *  Clerk's <UserButton> renders its own avatar, which cannot be replaced with
 *  arbitrary markup — so using it meant two circles in the header, neither of
 *  which was the face everyone else identifies you by. This drives Clerk
 *  through its client API instead and keeps a single control. */
export function AccountMenu({ seed }: { seed: number }) {
  const { openUserProfile, signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="account" ref={rootRef}>
      <button
        className="account-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
      >
        <Avatar seed={seed} />
      </button>

      {open && (
        <div className="account-menu" role="menu">
          {/* A full load, not a client navigation: the header lives in the
              root layout, which Next does not re-render on a soft nav, so the
              avatar here would keep the old face after a re-roll. */}
          <a role="menuitem" href="/me">Change my brat</a>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              openUserProfile()
            }}
          >
            Manage account
          </button>
          <button
            role="menuitem"
            className="is-danger"
            onClick={() => signOut({ redirectUrl: '/' })}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
