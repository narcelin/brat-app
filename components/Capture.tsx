'use client'

import { useEffect, useRef, useState } from 'react'
import {
  pickMimeType,
  VIDEO_BITS_PER_SECOND,
  photoTargetSize,
  canStartRecording,
  canStopRecording,
  isVideoFrameReady,
} from '../lib/media/recorder'
import { MAX_RECORDING_SECONDS } from '../lib/domain/trim'

export function Capture({
  onCaptured,
  onCancel,
}: {
  onCaptured: (file: File, kind: 'photo' | 'video', durationSeconds: number) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const mountedRef = useRef(true)

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [needsTap, setNeedsTap] = useState(false)
  const [live, setLive] = useState(false)
  const [mode, setMode] = useState<'photo' | 'video'>('video')

  useEffect(() => {
    let cancelled = false
    // Re-arm on every mount: the cleanup below sets this false, and React
    // Strict Mode's double-invoke would otherwise leave it false forever,
    // making `recorder.onstop` a permanent no-op under `next dev`.
    mountedRef.current = true

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        // Held in state as well as a ref: the element may not be mounted when
        // this resolves, and a ref write alone would never re-run the attach.
        setStream(stream)
      })
      .catch(() => setError('Camera access denied. Enable it in Settings to submit proof.'))

    return () => {
      cancelled = true
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Attaching the stream is not enough to make it visible. `autoPlay` does not
  // reliably fire for a srcObject assigned after mount, and React does not
  // dependably set the `muted` ATTRIBUTE — which iOS requires before it will
  // autoplay anything. Both are set here on the element itself, then play() is
  // called explicitly. Without this the preview is a black rectangle even
  // though the camera is on and permission was granted.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    video.muted = true
    video.playsInline = true
    video.srcObject = stream

    let cancelled = false
    video
      .play()
      .then(() => {
        if (!cancelled) {
          setLive(true)
          setNeedsTap(false)
        }
      })
      .catch(() => {
        // Autoplay refused despite the above — the platform wants a gesture.
        if (!cancelled) setNeedsTap(true)
      })

    return () => {
      cancelled = true
    }
  }, [stream])

  async function startPreview() {
    const video = videoRef.current
    if (!video) return
    try {
      video.muted = true
      await video.play()
      setLive(true)
      setNeedsTap(false)
    } catch {
      setError('The camera would not start. Close other apps using it and try again.')
    }
  }

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

    // Resize to at most MAX_PHOTO_EDGE on the long edge before upload. Full
    // sensor frames are several MB each for no visible benefit on a phone
    // screen. The maths lives in lib/media/recorder so it can be tested.
    const size = photoTargetSize(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
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

  if (error) {
    return (
      <div className="sheet-body">
        <p className="sheet-message">{error}</p>
        <div className="sheet-controls">
          <button className="btn" onClick={onCancel}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sheet-body">
      <video ref={videoRef} autoPlay playsInline muted className="sheet-video" />

      {!live && (
        <p className="sheet-message">
          {needsTap ? 'Tap the button below to start the camera' : 'Starting camera…'}
        </p>
      )}

      <button className="sheet-close" onClick={onCancel} aria-label="Close camera">
        ✕
      </button>

      {recording && (
        <p className="sheet-timer">
          {elapsed.toFixed(1)}s / {MAX_RECORDING_SECONDS}s
        </p>
      )}

      <div className="sheet-controls">
        {needsTap ? (
          <button className="btn" onClick={startPreview}>Start camera</button>
        ) : (
          <>
            {/* Hidden while recording: switching mode mid-take would drop it. */}
            <div className="mode-switch" hidden={recording}>
              <button
                className={mode === 'photo' ? 'is-on' : undefined}
                onClick={() => setMode('photo')}
              >
                Photo
              </button>
              <button
                className={mode === 'video' ? 'is-on' : undefined}
                onClick={() => setMode('video')}
              >
                Video
              </button>
            </div>

            <button
              className={`shutter${mode === 'video' ? ' is-video' : ''}${recording ? ' is-recording' : ''}`}
              onClick={mode === 'photo' ? takePhoto : recording ? stopRecording : startRecording}
              disabled={!live}
              aria-label={
                mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'
              }
            />
          </>
        )}
      </div>
    </div>
  )
}
