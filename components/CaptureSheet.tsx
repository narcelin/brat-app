'use client'

import { useEffect, useRef } from 'react'

/** A fullscreen camera surface rather than a video embedded in a scrolling
 *  page. Capture is a mode, not a section: the page behind must not scroll
 *  under it, and the controls belong over the frame the way a phone's own
 *  camera puts them. */
export function CaptureSheet({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  // Callers pass an inline arrow, so onClose changes identity every render.
  // Depending on it here would re-run the effect, and the re-run would capture
  // the ALREADY-hidden overflow as `previous` — leaving the page permanently
  // unscrollable once the sheet closed.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    // Lock the page behind. Without this, iOS scrolls the document under the
    // fixed sheet whenever a drag lands on it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Capture proof">
      {children}
    </div>
  )
}
