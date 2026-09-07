'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_TRIM_SECONDS, validateTrim } from '../lib/domain/trim'
import {
  adjustEnd, adjustStart, initialRange, timeFromPosition, type Range,
} from '../lib/media/trim-range'

const FRAME_COUNT = 6

/** Pulls stills off the recording for the filmstrip. Seeking and drawing is
 *  the only way to do this in a browser — there is no frame API — so it runs
 *  on a detached video element to avoid fighting the preview for currentTime. */
function useFilmstrip(src: string, duration: number): string[] {
  const [frames, setFrames] = useState<string[]>([])

  useEffect(() => {
    if (!duration) return
    let cancelled = false

    const video = document.createElement('video')
    video.src = src
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    const canvas = document.createElement('canvas')
    const shots: string[] = []

    /** `seeked` fires when the seek completes, which is not the same as a
     *  frame being decoded and ready to draw. Drawing on `seeked` alone
     *  reliably captured the previous frame — every still came out identical.
     *  Wait for HAVE_CURRENT_DATA, then one paint, before grabbing. */
    function seekTo(time: number): Promise<void> {
      return new Promise((resolve) => {
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          video.removeEventListener('seeked', onSeeked)
          requestAnimationFrame(() => resolve())
        }
        const onSeeked = () => {
          if (video.readyState >= 2) return done()
          video.addEventListener('canplay', done, { once: true })
        }
        video.addEventListener('seeked', onSeeked)
        // A container without seek cues can leave `seeked` unfired. Bounded
        // low: six frames each waiting the full timeout is the worst case, and
        // the strip renders blanks until they arrive, so a slow grab must not
        // leave the player staring at placeholders.
        setTimeout(done, 350)
        video.currentTime = time
      })
    }

    async function grab() {
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) return resolve()
        video.addEventListener('loadedmetadata', () => resolve(), { once: true })
      })

      canvas.width = 96
      canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 96)) || 128
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      for (let i = 0; i < FRAME_COUNT; i++) {
        if (cancelled) return
        // Sample from the middle of each slice, not its edge — the very first
        // frame of a phone recording is often black while exposure settles.
        await seekTo(((i + 0.5) / FRAME_COUNT) * duration)
        if (cancelled) return
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        shots.push(canvas.toDataURL('image/jpeg', 0.6))
        setFrames([...shots])
      }
    }

    grab().catch(() => {
      /* A filmstrip is a nicety; the handles still work without it. */
    })

    return () => {
      cancelled = true
      video.removeAttribute('src')
      video.load()
    }
  }, [src, duration])

  return frames
}

export function Trimmer({
  src,
  duration: reportedDuration,
  onChange,
  onDuration,
}: {
  src: string
  /** Wall-clock time measured while recording. Treated as a fallback: the
   *  container's own duration is authoritative and the two differ, sometimes
   *  by hundreds of milliseconds. Trimming against the wrong one produces a
   *  range ending past the real end, which the server then rejects. */
  duration: number
  onChange: (start: number, end: number, valid: boolean) => void
  onDuration?: (seconds: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<number | null>(null)
  const duration = measured ?? reportedDuration
  const [range, setRange] = useState<Range>(() => initialRange(reportedDuration))
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)

  const frames = useFilmstrip(src, duration)
  const result = validateTrim(range.start, range.end, duration)

  // Held in a ref, and deliberately NOT an effect dependency. Callers pass an
  // inline arrow, so its identity changes on every render of the parent; with
  // it in the dependency list this effect re-fires, calls setState on the
  // parent, and loops until React tears the tree down — which looked like
  // "stopping the recording does nothing", because the review screen crashed
  // the moment it mounted.
  const onChangeRef = useRef(onChange)
  const onDurationRef = useRef(onDuration)
  useEffect(() => {
    onChangeRef.current = onChange
    onDurationRef.current = onDuration
  })

  // MediaRecorder output reports `duration: Infinity` until the whole blob is
  // buffered — and MediaRecorder is exactly what this app records with. So the
  // duration is watched rather than read once, or it is always still Infinity
  // at the moment metadata arrives.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const read = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setMeasured(video.duration)
      }
    }

    read()
    video.addEventListener('durationchange', read)
    video.addEventListener('loadedmetadata', read)
    video.addEventListener('canplaythrough', read)
    return () => {
      video.removeEventListener('durationchange', read)
      video.removeEventListener('loadedmetadata', read)
      video.removeEventListener('canplaythrough', read)
    }
  }, [src])

  // Re-clamp to the real duration once it is known, so a range built against
  // the wall-clock estimate cannot end past the end of the recording.
  useEffect(() => {
    if (measured === null) return
    setRange((current) => ({
      start: Math.min(current.start, Math.max(measured - 0.1, 0)),
      end: Math.min(current.end, measured),
    }))
    onDurationRef.current?.(measured)
  }, [measured])

  useEffect(() => {
    onChangeRef.current(range.start, range.end, validateTrim(range.start, range.end, duration).ok)
  }, [range, duration])

  const move = useCallback(
    (clientX: number, handle: 'start' | 'end') => {
      const track = trackRef.current
      if (!track) return
      const box = track.getBoundingClientRect()
      const time = timeFromPosition(clientX - box.left, box.width, duration)

      setRange((current) => {
        const next = handle === 'start'
          ? adjustStart(time, current, duration)
          : adjustEnd(time, current, duration)
        // Scrub the preview to the handle being dragged, so you are choosing a
        // frame rather than a number.
        if (videoRef.current) {
          videoRef.current.currentTime = handle === 'start' ? next.start : next.end
        }
        return next
      })
    },
    [duration],
  )

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: PointerEvent) => {
      e.preventDefault()
      move(e.clientX, dragging)
    }
    const onUp = () => setDragging(null)

    // Bound to the window, not the handle: a finger that slides off the track
    // must keep dragging rather than silently dropping the gesture.
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, move])

  // A paused video with only metadata loaded has decoded no frame, so it
  // paints black until something forces a seek — which is why the preview
  // only appeared once a handle was dragged. Seek once on load to show the
  // start frame. Exactly 0 is avoided: currentTime is already 0, so assigning
  // it fires no seek and nothing decodes.
  const seededRef = useRef(false)
  useEffect(() => {
    const video = videoRef.current
    if (!video || seededRef.current) return

    const show = () => {
      if (seededRef.current) return
      seededRef.current = true
      video.currentTime = Math.min(Math.max(range.start, 0.05), Math.max(duration - 0.05, 0.05))
    }

    if (video.readyState >= 1) show()
    else video.addEventListener('loadedmetadata', show, { once: true })

    return () => video.removeEventListener('loadedmetadata', show)
  }, [range.start, duration])

  const pct = (t: number) => `${(t / Math.max(duration, 0.001)) * 100}%`
  const selected = range.end - range.start

  return (
    <div className="trimmer">
      <video ref={videoRef} src={src} playsInline muted preload="auto" className="preview" />

      <div className="filmstrip" ref={trackRef}>
        <div className="filmstrip-frames" aria-hidden="true">
          {frames.length > 0
            ? frames.map((f, i) => <img key={i} src={f} alt="" />)
            : Array.from({ length: FRAME_COUNT }, (_, i) => <span key={i} className="film-blank" />)}
        </div>

        <div className="film-shade" style={{ left: 0, width: pct(range.start) }} />
        <div className="film-shade" style={{ left: pct(range.end), right: 0 }} />

        <div
          className="film-window"
          style={{ left: pct(range.start), width: pct(selected) }}
        >
          <button
            type="button"
            className="film-handle is-start"
            onPointerDown={() => setDragging('start')}
            aria-label={`Trim start, ${range.start.toFixed(1)} seconds`}
          />
          <button
            type="button"
            className="film-handle is-end"
            onPointerDown={() => setDragging('end')}
            aria-label={`Trim end, ${range.end.toFixed(1)} seconds`}
          />
        </div>
      </div>

      <p className="status trim-readout">
        {range.start.toFixed(1)}s – {range.end.toFixed(1)}s
        <b> · {selected.toFixed(1)}s</b> of {MAX_TRIM_SECONDS}s
      </p>
      {!result.ok && <p className="status">{result.reason}</p>}
    </div>
  )
}
