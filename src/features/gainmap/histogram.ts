import { clamp } from '../../lib/math'

const HISTOGRAM_BINS = 1024

export function buildHistogram(values: Float32Array, min: number, max: number) {
  const histogram = new Uint32Array(HISTOGRAM_BINS)
  const span = Math.max(max - min, 1e-6)
  for (let i = 0; i < values.length; i++) {
    const normalized = clamp((values[i] - min) / span)
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor(normalized * (HISTOGRAM_BINS - 1)))
    histogram[bin] += 1
  }
  return histogram
}

export function histogramPercentile(histogram: Uint32Array, min: number, max: number, percentile: number) {
  const total = histogram.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return min
  const target = clamp(percentile, 0, 1) * (total - 1)
  let cumulative = 0
  for (let bin = 0; bin < histogram.length; bin++) {
    const count = histogram[bin]
    const next = cumulative + count
    if (target < next) {
      const within = count <= 0 ? 0 : (target - cumulative) / count
      return min + ((bin + within) / histogram.length) * (max - min)
    }
    cumulative = next
  }
  return max
}

export function percentileFromSorted(values: Float32Array, percentile: number) {
  if (values.length === 0) return 0
  const clamped = clamp(percentile, 0, 1)
  const index = (values.length - 1) * clamped
  const lower = Math.floor(index)
  const upper = Math.min(values.length - 1, lower + 1)
  const mixAmount = index - lower
  return values[lower] + (values[upper] - values[lower]) * mixAmount
}

export function sortedCopy(values: Float32Array) {
  const copy = Array.from(values)
  copy.sort((a, b) => a - b)
  return Float32Array.from(copy)
}
