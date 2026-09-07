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

/** A recorder can be (re)started only if none exists yet, or the existing one
 *  has fully wound down. Guards against a double-tap spinning up a second
 *  `MediaRecorder` against the same stream while the first is still live. */
export function canStartRecording(state: RecordingState | null): boolean {
  return state === null || state === 'inactive'
}

/** Stopping is only meaningful while the recorder is actually recording (or
 *  paused mid-recording). Calling stop with no recorder, or one that already
 *  wound down, should be a harmless no-op rather than throwing. */
export function canStopRecording(state: RecordingState | null): boolean {
  return state === 'recording' || state === 'paused'
}

/** A video element only has real pixel dimensions once its stream has
 *  produced a frame. Capturing before then yields a 0x0 canvas. */
export function isVideoFrameReady(videoWidth: number, videoHeight: number): boolean {
  return videoWidth > 0 && videoHeight > 0
}

/** Scale factor to bring a captured frame down to `maxEdge` on its *long*
 *  edge. Clamped at 1 so a frame already smaller than the cap is passed
 *  through untouched — upscaling would inflate the upload for no detail. */
export function photoScale(
  width: number,
  height: number,
  maxEdge: number = MAX_PHOTO_EDGE,
): number {
  const longEdge = Math.max(width, height)
  if (!(longEdge > 0)) return 1
  return Math.min(1, maxEdge / longEdge)
}

/** Target canvas size for a captured frame, with the aspect ratio preserved
 *  and each side rounded to a whole pixel. */
export function photoTargetSize(
  width: number,
  height: number,
  maxEdge: number = MAX_PHOTO_EDGE,
): { width: number; height: number } {
  const scale = photoScale(width, height, maxEdge)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Whether in-app capture is even possible here.
 *
 *  `navigator.mediaDevices` is undefined in a non-secure context and in some
 *  iOS home-screen (standalone) web apps. Reaching straight for
 *  `.getUserMedia` there throws synchronously, before any promise exists, so a
 *  `.catch()` never sees it — the effect dies silently and the UI waits for a
 *  camera that will never start. */
export function hasCameraApi(nav: {
  mediaDevices?: { getUserMedia?: unknown }
}): boolean {
  return typeof nav.mediaDevices?.getUserMedia === 'function'
}

/** Running from the home screen rather than a browser tab. iOS restricts
 *  camera access here on some versions, and the remedy is different: open the
 *  site in Safari, or use the native camera. */
export interface StandaloneWindow {
  matchMedia?: (q: string) => { matches: boolean }
  // `navigator.standalone` is Safari-only and absent from the DOM types.
  navigator?: { standalone?: boolean } | Navigator
}

export function isStandalone(win: StandaloneWindow): boolean {
  const nav = win.navigator as { standalone?: boolean } | undefined
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav?.standalone === true
  )
}
