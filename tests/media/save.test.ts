import { describe, it, expect } from 'vitest'
import { chooseSaveStrategy } from '../../lib/media/save'

const file = new File(['x'], 'proof.mp4', { type: 'video/mp4' })

describe('chooseSaveStrategy', () => {
  it('shares when the browser can share this file', () => {
    expect(chooseSaveStrategy({ share: () => {}, canShare: () => true }, file)).toBe('share')
  })

  it('downloads when the browser reports it cannot share this file', () => {
    expect(chooseSaveStrategy({ share: () => {}, canShare: () => false }, file)).toBe('download')
  })

  it('downloads when share is missing entirely', () => {
    expect(chooseSaveStrategy({}, file)).toBe('download')
  })

  it('downloads when canShare exists but share does not, rather than throwing', () => {
    expect(chooseSaveStrategy({ canShare: () => true }, file)).toBe('download')
  })

  it('downloads when canShare throws instead of returning false', () => {
    expect(
      chooseSaveStrategy({ share: () => {}, canShare: () => { throw new Error('nope') } }, file),
    ).toBe('download')
  })

  it('passes the actual file to canShare, since support is type dependent', () => {
    let seen: File | null = null
    chooseSaveStrategy({ share: () => {}, canShare: (d) => { seen = d.files[0]; return true } }, file)
    expect(seen).toBe(file)
  })
})
