'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface InviteView {
  code: string
  expiresAt: string
  maxUses: number
  uses: number
  revoked: boolean
  live: boolean
}

export function AdminInvites({ invites, origin }: { invites: InviteView[]; origin: string }) {
  const router = useRouter()
  const [maxUses, setMaxUses] = useState(16)
  const [days, setDays] = useState(14)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function post(body: unknown) {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    setBusy(false)
    const parsed = await res?.json().catch(() => null)
    if (!res?.ok) {
      setError(parsed?.error ?? 'That did not work.')
      return null
    }
    router.refresh()
    return parsed
  }

  async function copy(code: string) {
    const link = `${origin}/join?c=${code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(code)
    } catch {
      // Clipboard is blocked in some contexts; the link is on screen anyway.
      setError('Could not copy — the link is shown above.')
    }
  }

  return (
    <section className="admin-state">
      <p className="roster-head">Invites</p>

      <div className="invite-new">
        <label className="status" htmlFor="invite-uses">People</label>
        <input id="invite-uses" className="admin-input" type="number" min={1} max={100}
          value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
        <label className="status" htmlFor="invite-days">Expires in (days)</label>
        <input id="invite-days" className="admin-input" type="number" min={1} max={90}
          value={days} onChange={(e) => setDays(Number(e.target.value))} />
        <button className="btn" disabled={busy} onClick={() => post({ maxUses, days })}>
          {busy ? 'Working…' : 'Create an invite link'}
        </button>
      </div>

      {error && <p className="status admin-error">{error}</p>}

      {invites.length === 0 ? (
        <p className="status">No invites yet.</p>
      ) : (
        <ul className="turnout">
          {invites.map((i) => (
            <li key={i.code} className={i.live ? undefined : 'is-spent'}>
              <span>
                <code>{i.code}</code>
                <br />
                <span className="status">
                  {i.uses}/{i.maxUses} used
                  {i.revoked
                    ? ' — revoked'
                    : i.live
                      ? ` — expires ${i.expiresAt}`
                      : ' — expired or full'}
                </span>
                {i.live && (
                  <>
                    <br />
                    <span className="status invite-link">{origin}/join?c={i.code}</span>
                  </>
                )}
              </span>
              {i.live && (
                <span className="invite-actions">
                  <button className="btn ghost" onClick={() => copy(i.code)}>
                    {copied === i.code ? 'Copied' : 'Copy link'}
                  </button>
                  <button className="btn ghost" disabled={busy}
                    onClick={() => post({ action: 'revoke', code: i.code })}>
                    Revoke
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
