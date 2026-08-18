import { describe, expect, it } from 'vitest'
import { snapshotAnswerWord } from './snapshot-presentation'

describe('snapshotAnswerWord', () => {
  it('uses the established human verdict labels', () => {
    expect(snapshotAnswerWord('yes')).toBe('YES')
    expect(snapshotAnswerWord('no')).toBe('NO')
    expect(snapshotAnswerWord('unknown')).toBe('DUNNO')
  })
})
