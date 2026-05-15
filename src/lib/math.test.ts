import { describe, expect, it } from 'vitest'
import { clamp, lerp, smoothstep } from './math'

describe('math utilities', () => {
  it('clamps values to the supplied range', () => {
    expect(clamp(-1)).toBe(0)
    expect(clamp(2)).toBe(1)
    expect(clamp(5, 2, 4)).toBe(4)
  })

  it('interpolates with a clamped amount', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5)
    expect(lerp(10, 20, -1)).toBe(10)
    expect(lerp(10, 20, 2)).toBe(20)
  })

  it('smoothsteps monotonically through the transition', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.25)).toBeLessThan(smoothstep(0, 1, 0.75))
  })
})
