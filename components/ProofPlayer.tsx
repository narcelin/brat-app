'use client'

import { useEffect, useRef } from 'react'

/** Plays a submission through the authenticated media route. Video is clamped
 *  to the submitter's trim: the file holds the whole recording, and the trim
 *  is metadata, so the range has to be enforced on playback. */
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
      if (video.currentTime >= trimEnd) {
        video.pause()
        video.currentTime = trimStart
      }
    }

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
