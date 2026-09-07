'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_TRIM_SECONDS, validateTrim } from '../lib/domain/trim'
import {
  adjustEnd, adjustStart, initialRange, timeFromPosition, type Range,
} from '../lib/media/trim-range'

const FRAME_COUNT = 8

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

    function seekTo(time: number): Promise<void> {
      return new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
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
  duration,
  onChange,
}: {
  src: string
  duration: number
  onChange: (start: number, end: number, valid: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<Range>(() => initialRange(duration))
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
  useEffect(() => {
    onChangeRef.current = onChange
  })

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

  const pct = (t: number) => `${(t / Math.max(duration, 0.001)) * 100}%`
  const selected = range.end - range.start

  return (
    <div className="trimmer">
      <video ref={videoRef} src={src} playsInline muted preload="metadata" className="preview" />

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
