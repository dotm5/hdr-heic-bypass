import { describe, expect, it } from 'vitest'
import { isKnownWorkerResponse, serializeWorkerError } from './imageWorkerProtocol'

describe('worker protocol', () => {
  it('recognizes only known response types', () => {
    expect(isKnownWorkerResponse({ type: 'progress', id: 1, message: 'Generating HDR gain map' })).toBe(true)
    expect(isKnownWorkerResponse({ type: 'encoded', id: 1 })).toBe(true)
    expect(isKnownWorkerResponse({ type: 'unknown', id: 1 })).toBe(false)
    expect(isKnownWorkerResponse(null)).toBe(false)
  })

  it('serializes worker errors into user-visible messages', () => {
    expect(serializeWorkerError(3, new Error('failed'))).toEqual({ type: 'error', id: 3, message: 'failed' })
    expect(serializeWorkerError(4, 'bad input')).toEqual({ type: 'error', id: 4, message: 'bad input' })
  })
})
