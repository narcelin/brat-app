'use client'

import { useState } from 'react'
import { SubmitFlow } from './SubmitFlow'

/** Gates the camera behind a deliberate tap. Opening `getUserMedia` on page
 *  load threw the viewer straight into a camera — and triggered a permission
 *  prompt — before they had even read what the objective was. */
export function SubmitPanel({
  objectiveId,
  playerId,
  alreadySubmitted,
}: {
  objectiveId: number
  playerId: string
  alreadySubmitted: boolean
}) {
  const [capturing, setCapturing] = useState(false)

  if (capturing) {
    return (
      <div className="stack">
        <SubmitFlow objectiveId={objectiveId} playerId={playerId} />
        <button className="btn ghost" onClick={() => setCapturing(false)}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      {alreadySubmitted && (
        <p className="status">You have posted for this one. Recording again replaces it.</p>
      )}
      <button className="btn" onClick={() => setCapturing(true)}>
        {alreadySubmitted ? 'Replace my proof' : 'Record proof'}
      </button>
    </div>
  )
}
