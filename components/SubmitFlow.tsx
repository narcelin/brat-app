'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Capture } from './Capture'
import { Trimmer } from './Trimmer'
import { validateTrim } from '../lib/domain/trim'

export function SubmitFlow({ objectiveId }: { objectiveId: number }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<'photo' | 'video'>('video')
  const [duration, setDuration] = useState(0)
  const [trim, setTrim] = useState({ start: 0, end: 0, valid: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Memoised on `file` so a re-render (e.g. every Trimmer.onChange tick while
  // dragging the trim slider) does not mint a fresh blob URL each time — and
  // revoked below whenever `file` changes or the component unmounts, so URLs
  // never outlive the file they point to.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

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
          const end = Math.min(15, capturedDuration)
          setTrim({ start: 0, end, valid: validateTrim(0, end, capturedDuration).ok })
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
