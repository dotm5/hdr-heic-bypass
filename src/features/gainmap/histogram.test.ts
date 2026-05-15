import { describe, expect, it } from 'vitest'
import { buildHistogram, histogramPercentile } from './histogram'

describe('histogram utilities', () => {
  it('keeps percentile results monotonic', () => {
    const histogram = buildHistogram(new Float32Array([0, 0.25, 0.5, 0.75, 1]), 0, 1)
    expect(histogramPercentile(histogram, 0, 1, 0.25)).toBeLessThanOrEqual(histogramPercentile(histogram, 0, 1, 0.75))
  })

  it('falls back to min for empty histograms', () => {
    expect(histogramPercentile(new Uint32Array(8), -2, 4, 0.5)).toBe(-2)
  })

  it('does not produce invalid values for all-black or all-white inputs', () => {
    for (const values of [new Float32Array([0, 0, 0]), new Float32Array([1, 1, 1])]) {
      const histogram = buildHistogram(values, values[0], values[0])
      const p50 = histogramPercentile(histogram, values[0], values[0], 0.5)
      expect(Number.isNaN(p50)).toBe(false)
      expect(Number.isFinite(p50)).toBe(true)
    }
  })
})
