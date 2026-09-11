import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@vercel/blob', () => ({ del: vi.fn() }))

import { del } from '@vercel/blob'
import { mayDeleteSharedMedia, discardMedia } from '../../lib/blob/discard'

describe('mayDeleteSharedMedia', () => {
  it('allows only the production deployment', () => {
    expect(mayDeleteSharedMedia('production')).toBe(true)
  })

  // Every one of these is a deployment holding rows that point at production's
  // media, because the blob store does not branch with the database. A preview
  // branch is a copy-on-write clone of production, so its rows are *literally*
  // production's rows — deleting "its" media deletes the real thing.
  it('refuses every other environment', () => {
    for (const env of ['preview', 'development', 'PRODUCTION', 'prod', '', undefined]) {
      expect(mayDeleteSharedMedia(env), `should refuse ${JSON.stringify(env)}`).toBe(false)
    }
  })
})

describe('discardMedia', () => {
  beforeEach(() => {
    vi.mocked(del).mockReset()
    delete process.env.VERCEL_ENV
  })

  it('deletes in production and reports it', async () => {
    process.env.VERCEL_ENV = 'production'
    vi.mocked(del).mockResolvedValue(undefined as never)

    await expect(discardMedia('submissions/1/bob/clip.mp4')).resolves.toBe(true)
    expect(del).toHaveBeenCalledWith('submissions/1/bob/clip.mp4')
  })

  // The assertion that matters: not merely that it returns false, but that it
  // never reaches the store at all.
  it('does not touch the store outside production', async () => {
    for (const env of ['preview', 'development']) {
      process.env.VERCEL_ENV = env
      await expect(discardMedia('submissions/1/bob/clip.mp4')).resolves.toBe(false)
    }
    expect(del).not.toHaveBeenCalled()
  })

  it('does not touch the store when the env is unset, as it is locally', async () => {
    await expect(discardMedia('submissions/1/bob/clip.mp4')).resolves.toBe(false)
    expect(del).not.toHaveBeenCalled()
  })

  // Cleanup runs after the operation it is cleaning up after has committed.
  // Reporting a storage failure as a failure of that operation would tell a
  // player their submission did not save when it did.
  it('swallows a storage failure and reports nothing was deleted', async () => {
    process.env.VERCEL_ENV = 'production'
    vi.mocked(del).mockRejectedValue(new Error('blob store unreachable'))

    await expect(discardMedia('submissions/1/bob/clip.mp4')).resolves.toBe(false)
  })
})
