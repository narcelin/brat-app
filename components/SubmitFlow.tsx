'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Capture } from './Capture'
import { Trimmer } from './Trimmer'

export function SubmitFlow({ objectiveId }: { objectiveId: number }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<'photo' | 'video'>('video')
  const [duration, setDuration] = useState(0)
  const [trim, setTrim] = useState({ start: 0, end: 0, valid: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewUrl = file ? URL.createObjectURL(file) : null

  async function submit() {
    if (!file) return
    setBusy(true)
    setError(null)

    const form = new FormData()
    form.set('file', file)
    form.set('objectiveId', String(objectiveId))
    form.set('kind', kind)
    if (kind === 'video') {
      form.set('trimStart', String(trim.start))
      form.set('trimEnd', String(trim.end))
      form.set('duration', String(duration))
    }

    const res = await fetch('/api/submissions', { method: 'POST', body: form })
    setBusy(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Upload failed' }))
      setError(body.error ?? 'Upload failed')
      return
    }
    router.push('/')
    router.refresh()
  }

  if (!file) {
    return (
      <Capture
        onCaptured={(captured, capturedKind, capturedDuration) => {
          setFile(captured)
          setKind(capturedKind)
          setDuration(capturedDuration)
          setTrim({ start: 0, end: Math.min(15, capturedDuration), valid: true })
        }}
      />
    )
  }

  return (
    <div className="stack">
      {kind === 'video' && previewUrl ? (
        <Trimmer
          src={previewUrl}
          duration={duration}
          onChange={(start, end, valid) => setTrim({ start, end, valid })}
        />
      ) : (
        previewUrl && <img src={previewUrl} alt="Your proof" className="preview" />
      )}

      {error && <p className="status">{error}</p>}

      <button
        className="btn"
        disabled={busy || (kind === 'video' && !trim.valid)}
        onClick={submit}
      >
        {busy ? 'Uploading…' : 'Submit proof'}
      </button>
      <button className="btn ghost" onClick={() => setFile(null)} disabled={busy}>
        Retake
      </button>
      {previewUrl && (
        <a className="btn ghost" href={previewUrl} download={file.name}>
          Save full recording to my phone
        </a>
      )}
    </div>
  )
}
