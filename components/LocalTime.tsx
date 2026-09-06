'use client'

import { useEffect, useState } from 'react'

/** Renders an instant in the *viewer's* locale and timezone.
 *
 *  Formatting on the server would use the runtime's timezone (UTC on Vercel),
 *  which shows the wrong deadline to every player. Formatting during the first
 *  client render instead would disagree with the server-rendered HTML and
 *  trip a hydration mismatch, so the formatted value is only swapped in after
 *  mount; until then a stable placeholder is rendered on both sides. */
export function LocalTime({ iso }: { iso: string }) {
  const [formatted, setFormatted] = useState<string | null>(null)

  useEffect(() => {
    setFormatted(new Date(iso).toLocaleString())
  }, [iso])

  return <time dateTime={iso}>{formatted ?? '…'}</time>
}
