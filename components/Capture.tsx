'use client'

import { useEffect, useRef, useState } from 'react'
import {
  pickMimeType,
  VIDEO_BITS_PER_SECOND,
  photoTargetSize,
  canStartRecording,
  canStopRecording,
  isVideoFrameReady,
  hasCameraApi,
  hasMultipleCameras,
  isStandalone,
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
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [canFlip, setCanFlip] = useState(false)
  // The last facing that actually produced a stream. A device can advertise a
  // camera it will not open, and by then the previous one is already stopped —
  // phones will not hand out two at once — so a failed flip has to have
  // somewhere known-good to fall back to.
  const lastGoodFacing = useRef<'environment' | 'user'>('environment')
  // Set when in-app capture is impossible here and the native camera is the
  // only route left.
  const [useNativeCamera, setUseNativeCamera] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    // Re-arm on every mount: the cleanup below sets this false, and React
    // Strict Mode's double-invoke would otherwise leave it false forever,
    // making `recorder.onstop` a permanent no-op under `next dev`.
    mountedRef.current = true

    // Feature-detected rather than called blind: reaching for .getUserMedia
    // when mediaDevices is undefined throws synchronously, which no .catch()
    // below would ever see.
    if (!hasCameraApi(navigator)) {
      setUseNativeCamera(true)
      return () => {
        cancelled = true
      }
    }

    // Release the current camera before asking for the other one. A phone
    // will not open both at once, so requesting the second while the first is
    // live simply fails.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLive(false)

    // A hung permission prompt resolves neither way on some iOS builds, and
    // "Starting camera…" forever tells the player nothing they can act on.
    const timeout = setTimeout(() => {
      if (!cancelled) setUseNativeCamera(true)
    }, 12000)

    try {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: facing }, audio: true })
        .then((stream) => {
          clearTimeout(timeout)
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          lastGoodFacing.current = facing
          // Held in state as well as a ref: the element may not be mounted
          // when this resolves, and a ref write alone would never re-run the
          // attach.
          setStream(stream)

          // Only offer the flip when there is somewhere to flip to. Labels
          // need permission, which by here we have; if the query fails the
          // button is simply not shown rather than shown and broken.
          navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => {
              if (cancelled) return
              setCanFlip(hasMultipleCameras(devices))
            })
            .catch(() => {})
        })
        .catch((err: unknown) => {
          clearTimeout(timeout)
          if (cancelled) return

          // A flip that failed: the old camera is already stopped, so go back
          // to the one that worked rather than leaving a dead preview. Cannot
          // loop — the fallback is a facing that has already succeeded once.
          if (facing !== lastGoodFacing.current) {
            setError(null)
            setFacing(lastGoodFacing.current)
            return
          }

          // A denial is the player's to fix; anything else means in-app
          // capture is not going to work here, so offer the native camera.
          const denied = err instanceof DOMException && err.name === 'NotAllowedError'
          if (denied) {
            setError('Camera access denied. Enable it in Settings to submit proof.')
          } else {
            setUseNativeCamera(true)
          }
        })
    } catch {
      clearTimeout(timeout)
      setUseNativeCamera(true)
    }

    return () => {
      cancelled = true
      clearTimeout(timeout)
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [facing])

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

  /** The native camera returns a finished file, so duration has to be read
   *  back off it rather than timed while recording. */
  async function onNativeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked twice in a row
    if (!file) return

    const kind = file.type.startsWith('video/') ? 'video' : 'photo'
    if (kind === 'photo') {
      onCaptured(file, 'photo', 0)
      return
    }

    const url = URL.createObjectURL(file)
    try {
      const seconds = await new Promise<number>((resolve, reject) => {
        const probe = document.createElement('video')
        probe.preload = 'metadata'
        probe.onloadedmetadata = () => resolve(probe.duration)
        probe.onerror = () => reject(new Error('unreadable'))
        probe.src = url
      })

      if (!Number.isFinite(seconds) || seconds <= 0) {
        setError('Could not read that video. Try recording a shorter one.')
        return
      }
      if (seconds > MAX_RECORDING_SECONDS) {
        setError(`That clip is ${Math.round(seconds)}s. Keep it under ${MAX_RECORDING_SECONDS}s.`)
        return
      }
      onCaptured(file, 'video', seconds)
    } catch {
      setError('Could not read that video. Try again.')
    } finally {
      URL.revokeObjectURL(url)
    }
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

  if (useNativeCamera && !error) {
    const standalone = typeof window !== 'undefined' && isStandalone(window)
    return (
      <div className="sheet-body">
        <button className="sheet-close" onClick={onCancel} aria-label="Close camera">
          ✕
        </button>
        <div className="sheet-native">
          <p className="sheet-native-lead">The in-app camera cannot run here.</p>
          <p className="sheet-native-note">
            {standalone
              ? 'iOS blocks it in apps opened from the home screen. Use your normal camera below, or open brats.anico.dev in Safari to record in the app.'
              : 'Use your normal camera instead — the proof still counts the same.'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            onChange={onNativeFile}
            hidden
          />
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            Open camera
          </button>
        </div>
      </div>
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
      {/* Mirrored only in preview, the way every phone camera behaves: you
          expect your reflection while framing. The capture itself is not
          flipped — drawImage reads the raw frames, so a canvas photo and the
          recorded video both come out the right way round, matching what the
          platform camera app saves. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`sheet-video${facing === 'user' ? ' is-mirrored' : ''}`}
      />

      {!live && (
        <p className="sheet-message">
          {needsTap ? 'Tap the button below to start the camera' : 'Starting camera…'}
        </p>
      )}

      <button className="sheet-close" onClick={onCancel} aria-label="Close camera">
        ✕
      </button>

      {/* Hidden while recording: flipping stops the stream the recorder is
          writing from, which would end the take mid-way. */}
      {canFlip && !recording && (
        <button
          className="sheet-flip"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          aria-label={facing === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
        >
          ⟳
        </button>
      )}

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
