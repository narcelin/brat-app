import { describe, it, expect } from 'vitest'
import {
  validateSubmissionRequest,
  submissionPathname,
  submissionPathnamePrefix,
  isOwnSubmissionPathname,
  supersededPathname,
  type SubmissionWeek,
} from '../../lib/domain/submission-request'
import { MAX_UPLOAD_BYTES } from '../../lib/domain/trim'
import type { WeekState } from '../../lib/domain/week-state'

function week(state: WeekState, objectiveIds: number[] = [1, 2, 3]): SubmissionWeek {
  return { state, objectives: objectiveIds.map((id) => ({ id })) }
}

const photo = {
  objectiveId: 1,
  kind: 'photo' as const,
  contentType: 'image/jpeg',
  sizeBytes: 400_000,
}

const video = {
  objectiveId: 1,
  kind: 'video' as const,
  contentType: 'video/mp4',
  sizeBytes: 8_000_000,
  trimStart: 2,
  trimEnd: 12,
  duration: 40,
}

describe('validateSubmissionRequest — happy paths', () => {
  it('accepts a photo for an objective in the open week', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), photo)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.objectiveId).toBe(1)
    expect(result.value.kind).toBe('photo')
    // A photo carries no trim range at all.
    expect(result.value.trimStart).toBeNull()
    expect(result.value.trimEnd).toBeNull()
    expect(result.value.duration).toBeNull()
  })

  it('accepts a video and passes the trim range through', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), video)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ trimStart: 2, trimEnd: 12, duration: 40 })
  })

  it('accepts a file exactly at the upload cap', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...photo,
      sizeBytes: MAX_UPLOAD_BYTES,
    })
    expect(result.ok).toBe(true)
  })
})

describe('validateSubmissionRequest — the submission window', () => {
  // This is the rule that keeps the reveal synchronised. If it ever stops
  // being enforced, a player can post after the deadline having already seen
  // nothing — but, worse, the week's ordering guarantee is gone.
  it.each(['PENDING', 'VOTING', 'CLOSED'] as const)(
    'refuses a submission with 403 while the week is %s',
    (state) => {
      const result = validateSubmissionRequest(week(state), photo)
      expect(result).toEqual({ ok: false, status: 403, error: 'Submissions are closed' })
    },
  )

  it('refuses a video after the deadline too, before ever looking at the trim', () => {
    const result = validateSubmissionRequest(week('CLOSED'), video)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })

  it('refuses everything when there is no active week', () => {
    const result = validateSubmissionRequest(null, photo)
    expect(result).toEqual({ ok: false, status: 400, error: 'No active week' })
  })
})

describe('validateSubmissionRequest — objective membership', () => {
  it("refuses an objective that belongs to some other week", () => {
    const result = validateSubmissionRequest(week('SUBMITTING', [1, 2, 3]), {
      ...photo,
      objectiveId: 99,
    })
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Objective is not in the current week',
    })
  })

  it('refuses a non-integer objective id', () => {
    for (const objectiveId of [1.5, NaN, '1', null, undefined]) {
      const result = validateSubmissionRequest(week('SUBMITTING'), { ...photo, objectiveId })
      expect(result).toMatchObject({ ok: false, status: 400, error: 'Invalid objective id' })
    }
  })

  it('refuses a week with no objectives at all', () => {
    const result = validateSubmissionRequest(week('SUBMITTING', []), photo)
    expect(result).toMatchObject({ ok: false, status: 400 })
  })
})

describe('validateSubmissionRequest — media kind and content type', () => {
  it('refuses an unknown media kind', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), { ...photo, kind: 'gif' })
    expect(result).toEqual({ ok: false, status: 400, error: 'Unknown media kind' })
  })

  it('refuses a photo whose content type is not an image', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...photo,
      contentType: 'application/pdf',
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (result.ok) return
    expect(result.error).toMatch(/photo/)
  })

  it('refuses a video whose content type is an image', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...video,
      contentType: 'image/jpeg',
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (result.ok) return
    expect(result.error).toMatch(/video/)
  })

  it('refuses a missing content type', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...photo,
      contentType: undefined,
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('accepts any image or video subtype', () => {
    expect(
      validateSubmissionRequest(week('SUBMITTING'), { ...photo, contentType: 'image/heic' }).ok,
    ).toBe(true)
    expect(
      validateSubmissionRequest(week('SUBMITTING'), { ...video, contentType: 'video/webm' }).ok,
    ).toBe(true)
  })
})

describe('validateSubmissionRequest — size', () => {
  it('refuses an oversize upload with 413', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...photo,
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    })
    expect(result).toEqual({ ok: false, status: 413, error: 'File is too large' })
  })

  it('refuses an empty or unknown-size upload', () => {
    for (const sizeBytes of [0, -1, NaN, undefined, '400000']) {
      const result = validateSubmissionRequest(week('SUBMITTING'), { ...photo, sizeBytes })
      expect(result).toMatchObject({ ok: false, status: 400 })
    }
  })
})

describe('validateSubmissionRequest — trim', () => {
  it('refuses a trim that runs past the end of the recording', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...video,
      trimStart: 30,
      trimEnd: 41,
      duration: 40,
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses a trim longer than the 15s viewing cap', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...video,
      trimStart: 0,
      trimEnd: 16,
      duration: 40,
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses an inverted trim range', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...video,
      trimStart: 10,
      trimEnd: 5,
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses a recording longer than the recording cap', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), { ...video, duration: 61 })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses missing trim values on a video', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      objectiveId: 1,
      kind: 'video',
      contentType: 'video/mp4',
      sizeBytes: 1000,
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('ignores trim values supplied alongside a photo', () => {
    const result = validateSubmissionRequest(week('SUBMITTING'), {
      ...photo,
      trimStart: 99,
      trimEnd: -5,
      duration: 9999,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.trimStart).toBeNull()
  })
})

describe('submission pathnames', () => {
  it('derives a key inside the player’s own directory for the objective', () => {
    expect(submissionPathname(7, 'user_abc', 'mp4')).toBe('submissions/7/user_abc/proof.mp4')
  })

  it('strips anything but alphanumerics from a caller-supplied extension', () => {
    expect(submissionPathname(7, 'user_abc', '../../evil')).toBe(
      'submissions/7/user_abc/proof.evil',
    )
  })

  it('ends the prefix with a slash so one player id cannot prefix another', () => {
    const prefix = submissionPathnamePrefix(7, 'user_a')
    expect(prefix.endsWith('/')).toBe(true)
    // Without the trailing slash this key would look like user_a's.
    expect(isOwnSubmissionPathname('submissions/7/user_ab/proof.mp4', 7, 'user_a')).toBe(false)
  })

  it('accepts the player’s own key, including a random suffix', () => {
    expect(isOwnSubmissionPathname('submissions/7/user_a/proof.mp4', 7, 'user_a')).toBe(true)
    expect(isOwnSubmissionPathname('submissions/7/user_a/proof-Xy9z.mp4', 7, 'user_a')).toBe(true)
  })

  it('refuses another player’s key', () => {
    expect(isOwnSubmissionPathname('submissions/7/user_b/proof.mp4', 7, 'user_a')).toBe(false)
  })

  it('refuses the same player’s key under a different objective', () => {
    expect(isOwnSubmissionPathname('submissions/8/user_a/proof.mp4', 7, 'user_a')).toBe(false)
  })

  it('refuses a deeper path, an empty filename, and a non-string', () => {
    expect(isOwnSubmissionPathname('submissions/7/user_a/nested/proof.mp4', 7, 'user_a')).toBe(
      false,
    )
    expect(isOwnSubmissionPathname('submissions/7/user_a/', 7, 'user_a')).toBe(false)
    expect(isOwnSubmissionPathname(null, 7, 'user_a')).toBe(false)
    expect(isOwnSubmissionPathname(undefined, 7, 'user_a')).toBe(false)
  })
})

describe('supersededPathname', () => {
  const OLD = 'submissions/7/user_a/proof-abc123.mp4'
  const NEW = 'submissions/7/user_a/proof-def456.mp4'

  it('returns the replaced blob so it can be cleaned up', () => {
    expect(supersededPathname(OLD, NEW)).toBe(OLD)
  })

  it('returns null on a first submission, when nothing was replaced', () => {
    expect(supersededPathname(null, NEW)).toBeNull()
  })

  // THE DANGEROUS CASE. `addRandomSuffix` currently makes every upload a new
  // key, but if that is ever turned off a replacement reuses the same key —
  // and deleting it would destroy the media the row now points at, leaving a
  // submission that looks fine in the database and 404s for every viewer.
  it('never returns the pathname the row now points at', () => {
    expect(supersededPathname(NEW, NEW)).toBeNull()
  })

  it('ignores an empty or blank previous pathname rather than calling del on it', () => {
    expect(supersededPathname('', NEW)).toBeNull()
    expect(supersededPathname('   ', NEW)).toBeNull()
  })

  it('ignores a non-string previous pathname', () => {
    expect(supersededPathname(undefined, NEW)).toBeNull()
    expect(supersededPathname(42 as unknown as string, NEW)).toBeNull()
  })
})
