'use client'

import { useEffect, useRef, useState } from 'react'
import {
  pickMimeType,
  VIDEO_BITS_PER_SECOND,
  MAX_PHOTO_EDGE,
  canStartRecording,
  canStopRecording,
  isVideoFrameReady,
} from '../lib/media/recorder'
import { MAX_RECORDING_SECONDS } from '../lib/domain/trim'

export function Capture({
  onCaptured,
}: {
  onCaptured: (file: File, kind: 'photo' | 'video', durationSeconds: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const mountedRef = useRef(true)

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError('Camera access denied. Enable it in Settings to submit proof.'))

    return () => {
      cancelled = true
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Hard stop at the recording cap, mirroring the server-side check.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000
      setElapsed(seconds)
      if (seconds >= MAX_RECORDING_SECONDS) stopRecording()
    }, 100)
    return () => clearInterval(id)
  }, [recording])

  function startRecording() {
    const stream = streamRef.current
    if (!stream) return
    if (!canStartRecording(recorderRef.current?.state ?? null)) return

    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t))
    if (!mimeType) {
      setError('This browser cannot record video. Try Safari or Chrome.')
      return
    }

    const chunks: BlobPart[] = []
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = () => {
      recorderRef.current = null
      if (!mountedRef.current) return
      const duration = (Date.now() - startedAtRef.current) / 1000
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
      const file = new File(chunks, `proof.${ext}`, { type: mimeType })
      onCaptured(file, 'video', Math.min(duration, MAX_RECORDING_SECONDS))
    }

    recorderRef.current = recorder
    startedAtRef.current = Date.now()
    recorder.start()
    setRecording(true)
  }

  function stopRecording() {
    if (!canStopRecording(recorderRef.current?.state ?? null)) return
    recorderRef.current?.stop()
    setRecording(false)
    setElapsed(0)
  }

  function takePhoto() {
    const video = videoRef.current
    if (!video) return

    if (!isVideoFrameReady(video.videoWidth, video.videoHeight)) {
      setError('Camera is still warming up. Try again in a moment.')
      return
    }

    // Resize to at most 1600px on the long edge before upload. Full sensor
    // frames are several MB each for no visible benefit on a phone screen.
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not process the photo. Please try again.')
          return
        }
        onCaptured(new File([blob], 'proof.jpg', { type: 'image/jpeg' }), 'photo', 0)
      },
      'image/jpeg',
      0.85,
    )
  }

  if (error) return <p className="status">{error}</p>

  return (
    <div className="capture">
      <video ref={videoRef} autoPlay playsInline muted className="preview" />
      {recording && (
        <p className="status">
          {elapsed.toFixed(1)}s / {MAX_RECORDING_SECONDS}s
        </p>
      )}
      <div className="stack">
        <button
          className="btn"
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? 'Stop' : 'Record video'}
        </button>
        {!recording && (
          <button className="btn ghost" onClick={takePhoto}>
            Take photo
          </button>
        )}
      </div>
    </div>
  )
}
