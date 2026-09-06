/** Ordered by preference. MP4/H.264 first: Safari on iOS records it natively
 *  and every browser plays it, which is what keeps us out of transcoding.
 *  WebM is the fallback for Chrome and Firefox on desktop. */
const CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/** `supported` is injected so this is testable without a browser —
 *  pass `MediaRecorder.isTypeSupported` in real use. */
export function pickMimeType(supported: (type: string) => boolean): string | null {
  return CANDIDATES.find((type) => supported(type)) ?? null
}

/** Modest bitrate: a 60s clip lands near 10MB, which uploads over bad cell
 *  service and keeps season egress small. */
export const VIDEO_BITS_PER_SECOND = 1_500_000

/** Longest edge for uploaded photos. Full sensor frames are several MB for no
 *  visible gain on a phone screen. */
export const MAX_PHOTO_EDGE = 1600
