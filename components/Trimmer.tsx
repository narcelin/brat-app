'use client'

import { useState } from 'react'
import { MAX_TRIM_SECONDS, validateTrim } from '../lib/domain/trim'

export function Trimmer({
  src,
  duration,
  onChange,
}: {
  src: string
  duration: number
  onChange: (start: number, end: number, valid: boolean) => void
}) {
  const [start, setStart] = useState(0)
  const end = Math.min(start + MAX_TRIM_SECONDS, duration)
  const result = validateTrim(start, end, duration)

  function update(nextStart: number) {
    setStart(nextStart)
    const nextEnd = Math.min(nextStart + MAX_TRIM_SECONDS, duration)
    onChange(nextStart, nextEnd, validateTrim(nextStart, nextEnd, duration).ok)
  }

  return (
    <div className="stack">
      <video src={src} controls playsInline className="preview" />
      <label className="status">
        Showing {start.toFixed(1)}s – {end.toFixed(1)}s
        {' '}(max {MAX_TRIM_SECONDS}s)
      </label>
      <input
        type="range"
        min={0}
        max={Math.max(0, duration - 0.1)}
        step={0.1}
        value={start}
        onChange={(e) => update(Number(e.target.value))}
      />
      {!result.ok && <p className="status">{result.reason}</p>}
    </div>
  )
}
