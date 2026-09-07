'use client'

import { useEffect, useRef } from 'react'
import { clampPlaybackTime } from '../lib/media/playback-clamp'

/** Plays a submission through the authenticated media route. Video is clamped
 *  to the submitter's trim: the file holds the whole recording, and the trim
 *  is metadata, so the range has to be enforced on playback. The native
 *  scrubber can still drag the position anywhere — including back before
 *  `trimStart` — so both edges are enforced on every `timeupdate`, not just
 *  the upper one. */
export function ProofPlayer({
  pathname,
  mediaType,
  trimStart,
  trimEnd,
}: {
  pathname: string
  mediaType: 'photo' | 'video'
  trimStart: number | null
  trimEnd: number | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const src = `/api/media/${pathname}`

  useEffect(() => {
    const video = videoRef.current
    if (!video || mediaType !== 'video' || trimStart === null || trimEnd === null) return

    const onLoaded = () => {
      video.currentTime = trimStart
    }
    const onTime = () => {
      const target = clampPlaybackTime(video.currentTime, trimStart, trimEnd)
      if (target === null) return
      if (target === trimStart && video.currentTime >= trimEnd) video.pause()
      video.currentTime = target
    }

    // `loadedmetadata` may have already fired by the time this effect runs
    // (e.g. a cached video, or a fast-loading one) — the event won't fire
    // again, so apply the seek immediately when the element already has it.
    if (video.readyState >= 1) onLoaded()

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
    }
  }, [mediaType, trimStart, trimEnd])

  if (mediaType === 'photo') {
    return <img src={src} alt="Proof" className="proof" />
  }

  return <video ref={videoRef} src={src} className="proof" controls playsInline preload="metadata" />
}
