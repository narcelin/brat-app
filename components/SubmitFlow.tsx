'use client'

import { upload } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Capture } from './Capture'
import { Trimmer } from './Trimmer'
import { MAX_UPLOAD_BYTES, validateTrim } from '../lib/domain/trim'
import { submissionPathname } from '../lib/domain/submission-request'

/** Extension for the blob key. Only cosmetic — the server pins the directory
 *  and strips anything that is not alphanumeric. */
function extensionFor(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : ''
  if (fromName) return fromName
  if (file.type.startsWith('image/')) return 'jpg'
  return file.type.includes('mp4') ? 'mp4' : 'webm'
}

export function SubmitFlow({
  objectiveId,
  playerId,
}: {
  objectiveId: number
  /** The viewer's own id, used to derive their upload key. Never another
   *  player's — nothing about anyone else reaches this component. */
  playerId: string
}) {
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
    setError(null)

    // Fail fast and legibly rather than letting the store reject the PUT.
    // The same cap is enforced server-side, in the token and again against
    // the stored blob's real size.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That recording is too large to upload. Try a shorter clip.')
      return
    }

    setBusy(true)

    const trimFields =
      kind === 'video'
        ? { trimStart: trim.start, trimEnd: trim.end, duration }
        : {}

    try {
      // Straight to Blob: routing the file through a serverless function
      // would cap it at ~4.5MB, which a ~25s clip already exceeds. The
      // handleUpload route re-checks every rule before minting the token.
      const blob = await upload(
        submissionPathname(objectiveId, playerId, extensionFor(file)),
        file,
        {
          access: 'private',
          contentType: file.type,
          handleUploadUrl: '/api/submissions/upload',
          clientPayload: JSON.stringify({
            objectiveId,
            kind,
            contentType: file.type,
            sizeBytes: file.size,
            ...trimFields,
          }),
        },
      )

      // Then a tiny JSON body to record the row. Deliberately not
      // onUploadCompleted, which never fires on localhost.
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: blob.url,
          pathname: blob.pathname,
          objectiveId,
          kind,
          ...trimFields,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Upload failed' }))
        setError(body.error ?? 'Upload failed')
        return
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
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
